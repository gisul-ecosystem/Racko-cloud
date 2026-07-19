import { IpAddress } from './ipAddress.model';
import { logger } from '../../utils/logger';

const STALE_RESERVATION_MINUTES = 10;

/**
 * Atomically reserve the lowest available public IP for a VM.
 * Uses findOneAndUpdate so two concurrent VM creations never get the same IP.
 * Stores a temporary reservation key (Proxmox vmid string) until the MongoDB
 * VM document is created, at which point updateIpVmId() replaces it.
 * Throws if the pool is exhausted.
 */
export async function allocateIP(reservationKey: string): Promise<{ ip: string; gateway: string }> {
  const record = await IpAddress.findOneAndUpdate(
    { status: 'available' },
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
    throw new Error('No public IPs available. The IP pool is exhausted.');
  }

  logger.info('[IPAllocator] IP reserved', { ip: record.ip, gateway: record.gateway, reservationKey });
  logger.info(`[BulkVM] [vmid=${reservationKey}] STEP: allocateIP called | data: ip=${record.ip} gateway=${record.gateway}`);
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
