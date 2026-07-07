import mongoose from 'mongoose';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { VM } from '../vm.model';

/**
 * Per-VM lease lock for Hyper-V provisioning.
 *
 * Only one provisioner may act on a VM at a time. The lock is a timestamp
 * (`hyperVLockedUntil`): a live provisioner renews it on a heartbeat, while a
 * crashed process lets it expire so the sweeper can safely reclaim the VM.
 * This prevents the sweeper (or a second API instance) from running a second
 * provisioner concurrently against the same guest.
 */

/** Mongo filter matching a VM with no live lock (absent or already expired). */
export function hyperVLockFree(now: Date = new Date()): Record<string, unknown> {
  return {
    $or: [
      { hyperVLockedUntil: { $exists: false } },
      { hyperVLockedUntil: null },
      { hyperVLockedUntil: { $lte: now } },
    ],
  };
}

/** Atomically claim the lease. Returns false if another owner holds a live lock. */
export async function acquireHyperVLock(
  vmObjectId: mongoose.Types.ObjectId,
  leaseMs: number
): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + leaseMs);
  const doc = await VM.findOneAndUpdate(
    { _id: vmObjectId, ...hyperVLockFree(now) },
    { $set: { hyperVLockedUntil: until } },
    { new: true }
  );
  return doc != null;
}

async function renewHyperVLock(
  vmObjectId: mongoose.Types.ObjectId,
  leaseMs: number
): Promise<void> {
  const until = new Date(Date.now() + leaseMs);
  await VM.findByIdAndUpdate(vmObjectId, { $set: { hyperVLockedUntil: until } });
}

async function releaseHyperVLock(vmObjectId: mongoose.Types.ObjectId): Promise<void> {
  await VM.findByIdAndUpdate(vmObjectId, { $unset: { hyperVLockedUntil: 1 } });
}

/**
 * Run `work` while holding the per-VM lease, renewing it on a heartbeat. If the
 * lock is already held by another owner, returns `false` without running.
 * On completion (or throw) the lock is released.
 */
export async function withHyperVLock(
  vmObjectId: mongoose.Types.ObjectId,
  context: { vmid: number; node: string },
  work: () => Promise<unknown>
): Promise<boolean> {
  const leaseMs = config.HYPERV_LOCK_LEASE_MS;
  const acquired = await acquireHyperVLock(vmObjectId, leaseMs);
  if (!acquired) {
    logger.info('[HyperV] lock busy — another provisioner owns this VM, skipping', {
      vmid: context.vmid,
      node: context.node,
    });
    return false;
  }

  const heartbeat = setInterval(() => {
    void renewHyperVLock(vmObjectId, leaseMs).catch((err: unknown) => {
      logger.warn('[HyperV] lock renew failed', {
        vmid: context.vmid,
        node: context.node,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, config.HYPERV_LOCK_HEARTBEAT_MS);
  // Never let the heartbeat keep the process alive on shutdown.
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  try {
    await work();
    return true;
  } finally {
    clearInterval(heartbeat);
    await releaseHyperVLock(vmObjectId).catch(() => undefined);
  }
}
