import mongoose from 'mongoose';
import { VM } from '../vm.model';
import type { HyperVStatus } from '../vm.types';

/** Statuses where a virtualization change is still in flight. */
export const HYPERV_IN_PROGRESS: HyperVStatus[] = ['pending', 'enabling', 'disabling'];

export function isHyperVInProgress(status?: HyperVStatus): boolean {
  return status != null && HYPERV_IN_PROGRESS.includes(status);
}

type UpdateOpts = {
  lastError?: string;
  resetAttempts?: boolean;
  incrementAttempts?: boolean;
  enableVirtualization?: boolean;
};

/**
 * Update Hyper-V status and always bump `hyperVStatusChangedAt` (for sweeper accuracy).
 */
export async function updateHyperVStatus(
  vmObjectId: mongoose.Types.ObjectId,
  status: HyperVStatus,
  opts: UpdateOpts = {}
): Promise<void> {
  const $set: Record<string, unknown> = {
    hyperVStatus: status,
    hyperVStatusChangedAt: new Date(),
  };

  if (opts.lastError !== undefined) {
    $set.hyperVLastError = opts.lastError;
  }
  if (opts.resetAttempts) {
    $set.hyperVAttemptCount = 0;
  }
  if (opts.enableVirtualization !== undefined) {
    $set.enableVirtualization = opts.enableVirtualization;
  }

  const update: { $set: Record<string, unknown>; $inc?: { hyperVAttemptCount: number } } = { $set };
  if (opts.incrementAttempts) {
    update.$inc = { hyperVAttemptCount: 1 };
  }

  await VM.findByIdAndUpdate(vmObjectId, update);
}
