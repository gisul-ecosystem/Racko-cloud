import { IpAddress, type IpPoolType } from './ipAddress.model';
import { logger } from '../../utils/logger';
import { parseCidr } from './helpers/ipCidr';
import { config } from '../../config';

const STALE_RESERVATION_MINUTES = 10;

// The private pool lives on the custnet1 bridge — an internal-only network not
// routed to the internet. custnet1 itself is a flat /16, but we deliberately
// only seed/allocate from a bounded sub-block (PRIVATE_POOL_CIDR, default a
// /22 = ~1000 hosts) instead of the full /16 (~65k hosts) to keep seeding fast
// and avoid handing out addresses that are statically assigned elsewhere on
// the bridge. PRIVATE_POOL_RESERVED additionally excludes specific known-in-use
// addresses (e.g. the gateway, or hosts found by scanning the cluster) without
// requiring a code change. Seeded lazily (see ensurePrivatePoolSeeded) so no
// manual admin step is required before the first private VM is created.

let privatePoolSeedPromise: Promise<void> | null = null;

/**
 * Lazily seed the private IP pool from PRIVATE_POOL_CIDR the first time it's
 * needed. Generates host IPs programmatically from the CIDR (parseCidr already
 * excludes the network/broadcast addresses of the block), drops anything in
 * PRIVATE_POOL_RESERVED, and upserts with $setOnInsert only — so an IP that
 * already has a record (already allocated/used, or seeded by a previous run)
 * is never touched, making re-seeding idempotent and unable to double-allocate.
 * Cached in-process so concurrent callers await the same seed run instead of
 * racing duplicate bulk inserts.
 */
async function ensurePrivatePoolSeeded(): Promise<void> {
  const alreadySeeded = await IpAddress.exists({ poolType: 'private' });
  if (alreadySeeded) return;

  if (!privatePoolSeedPromise) {
    privatePoolSeedPromise = (async () => {
      const reserved = new Set(config.PRIVATE_POOL_RESERVED);
      const allIps = parseCidr(config.PRIVATE_POOL_CIDR).filter(
        (ip) => ip !== config.PRIVATE_POOL_GATEWAY && !reserved.has(ip)
      );
      const ops = allIps.map((ip) => ({
        updateOne: {
          filter: { ip },
          update: {
            $setOnInsert: {
              ip,
              gateway: config.PRIVATE_POOL_GATEWAY,
              status: 'available' as const,
              poolType: 'private' as const,
            },
          },
          upsert: true,
        },
      }));

      const result = await IpAddress.bulkWrite(ops, { ordered: false });
      logger.info('[IPAllocator] Private pool auto-seeded from bounded custnet1 CIDR', {
        cidr: config.PRIVATE_POOL_CIDR,
        gateway: config.PRIVATE_POOL_GATEWAY,
        reservedCount: reserved.size,
        candidateCount: allIps.length,
        inserted: result.upsertedCount,
      });
    })().finally(() => {
      privatePoolSeedPromise = null;
    });
  }

  await privatePoolSeedPromise;
}

/**
 * Atomically reserve the lowest available IP from the given pool for a VM.
 * Uses findOneAndUpdate so two concurrent VM creations never get the same IP.
 * Stores a temporary reservation key (Proxmox vmid string) until the MongoDB
 * VM document is created, at which point updateIpVmId() replaces it.
 * Throws if the pool is exhausted.
 */
export async function allocateIP(
  reservationKey: string,
  poolType: IpPoolType = 'public'
): Promise<{ ip: string; gateway: string }> {
  if (poolType === 'private') {
    await ensurePrivatePoolSeeded();
  }

  const record = await IpAddress.findOneAndUpdate(
    { status: 'available', poolType },
    {
      $set: {
        status: 'reserved',
        vmId: reservationKey,
        reservedAt: new Date(),
      },
    },
    { sort: { ip: 1 }, new: true }
  );

  if (!record) {
    throw new Error(
      poolType === 'private'
        ? 'No private IPs available. The private (custnet1) IP pool is exhausted.'
        : 'No public IPs available. The IP pool is exhausted.'
    );
  }

  logger.info('[IPAllocator] IP reserved', { ip: record.ip, gateway: record.gateway, poolType, reservationKey });
  logger.info(`[BulkVM] [vmid=${reservationKey}] STEP: allocateIP called | data: ip=${record.ip} gateway=${record.gateway} poolType=${poolType}`);
  return { ip: record.ip, gateway: record.gateway };
}

/**
 * After VM.create() succeeds, swap the temporary reservation key for the real
 * MongoDB ObjectId so releaseIP() and the list query work correctly.
 */
export async function updateIpVmId(ip: string, mongoVmId: string): Promise<void> {
  await IpAddress.findOneAndUpdate(
    { ip },
    { $set: { vmId: mongoVmId } }
  );
}

/**
 * Promote a reserved IP to assigned. Queries by ip only — vmId has already
 * been updated to the MongoDB ObjectId via updateIpVmId().
 */
export async function confirmIP(ip: string, mongoVmId: string): Promise<void> {
  await IpAddress.findOneAndUpdate(
    { ip, vmId: mongoVmId },
    {
      $set: {
        status: 'assigned',
        assignedAt: new Date(),
      },
    }
  );
  logger.info('[IPAllocator] IP confirmed/assigned', { ip, mongoVmId });
  logger.info(`[BulkVM] [vmid=${mongoVmId}] STEP: confirmIP called — IP promoted to assigned | data: ip=${ip} mongoVmId=${mongoVmId}`);
}

/**
 * Release an IP back to the pool when a VM is deleted or creation fails.
 */
export async function releaseIP(vmId: string): Promise<void> {
  const record = await IpAddress.findOneAndUpdate(
    { vmId },
    {
      $set: { status: 'available' },
      $unset: { vmId: 1, reservedAt: 1, assignedAt: 1 },
    },
    { new: true }
  );

  if (record) {
    logger.info('[IPAllocator] IP released', { ip: record.ip, vmId });
  } else {
    logger.warn('[IPAllocator] releaseIP — no IP record found for vmId', { vmId });
  }
}

/**
 * Cron job: reclaim IPs that were reserved but never confirmed because VM
 * creation crashed mid-way. Runs every 10 minutes.
 */
export async function cleanupStaleReservations(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RESERVATION_MINUTES * 60 * 1000);

  const result = await IpAddress.updateMany(
    { status: 'reserved', reservedAt: { $lt: cutoff } },
    {
      $set: { status: 'available' },
      $unset: { vmId: 1, reservedAt: 1 },
    }
  );

  if (result.modifiedCount > 0) {
    logger.warn('[IPAllocator] Reclaimed stale reserved IPs', {
      count: result.modifiedCount,
      cutoff: cutoff.toISOString(),
    });
  }
}

/** Start the 10-minute cleanup interval. Call once at app startup. */
export function startIpCleanupCron(): void {
  setInterval(() => {
    cleanupStaleReservations().catch((err: unknown) => {
      logger.error('[IPAllocator] Stale reservation cleanup failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, STALE_RESERVATION_MINUTES * 60 * 1000);

  logger.info('[IPAllocator] Stale reservation cleanup cron started', {
    intervalMinutes: STALE_RESERVATION_MINUTES,
  });
}
