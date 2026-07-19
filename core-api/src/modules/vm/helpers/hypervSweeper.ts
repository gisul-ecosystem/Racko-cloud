import mongoose from 'mongoose';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { VM } from '../vm.model';
import type { HyperVStatus } from '../vm.types';
import { scheduleHyperVEnable, scheduleHyperVDisable } from './hypervQueue';
import { updateHyperVStatus } from './hypervStatus';
import { hyperVLockFree } from './hypervLock';

const SWEEP_BATCH = 25;

const SWEEPER_FAIL_MESSAGE =
  'Virtualization change timed out after multiple attempts. Retry from the VM detail page.';

/** Effective status timestamp for stuck detection (legacy VMs without hyperVStatusChangedAt). */
function statusChangedBeforeCutoff(cutoff: Date): Record<string, unknown> {
  return {
    $expr: {
      $lt: [{ $ifNull: ['$hyperVStatusChangedAt', '$updatedAt'] }, cutoff],
    },
  };
}

/**
 * Retries stuck `pending` / `enabling` / `disabling` Hyper-V jobs after API restarts or agent drops.
 */
export function startHyperVSweeper(): void {
  const intervalMs = config.HYPERV_SWEEPER_INTERVAL_MS;
  setInterval(() => {
    void sweepStuckHyperVJobs().catch((err: unknown) => {
      logger.warn('[HyperV] sweeper tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);
  logger.info('[HyperV] sweeper started', { intervalMs });
}

async function markSweeperFailed(
  vmObjectId: mongoose.Types.ObjectId,
  vmid: number,
  node: string,
  reason: string
): Promise<void> {
  logger.warn('[HyperV] sweeper — max attempts reached', { vmid, node, reason });
  await updateHyperVStatus(vmObjectId, 'failed', { lastError: SWEEPER_FAIL_MESSAGE });
}

async function handleStuckVm(
  vm: {
    _id: mongoose.Types.ObjectId;
    node: string;
    vmid: number;
    name: string;
    adminId: mongoose.Types.ObjectId;
    hyperVStatus: HyperVStatus;
    enableVirtualization?: boolean;
    hyperVAttemptCount?: number;
  },
  action: 'enable' | 'disable'
): Promise<void> {
  const attempts = vm.hyperVAttemptCount ?? 0;
  if (attempts >= config.HYPERV_MAX_SWEEPER_ATTEMPTS) {
    await markSweeperFailed(vm._id, vm.vmid, vm.node, `stuck ${vm.hyperVStatus}`);
    return;
  }

  await updateHyperVStatus(vm._id, vm.hyperVStatus, {
    incrementAttempts: true,
  });

  const params = {
    vmObjectId: vm._id,
    node: vm.node,
    vmid: vm.vmid,
    adminId: vm.adminId,
    vmName: vm.name,
  };

  if (action === 'enable') {
    logger.info('[HyperV] sweeper — retry enable', {
      vmid: vm.vmid,
      node: vm.node,
      attempt: attempts + 1,
      status: vm.hyperVStatus,
    });
    scheduleHyperVEnable(params, vm.hyperVStatus === 'enabling');
  } else {
    logger.info('[HyperV] sweeper — retry disable', {
      vmid: vm.vmid,
      node: vm.node,
      attempt: attempts + 1,
    });
    scheduleHyperVDisable(params, true);
  }
}

export async function sweepStuckHyperVJobs(): Promise<void> {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const pendingCutoff = new Date(nowMs - config.HYPERV_STUCK_PENDING_MS);
  // A live provisioner renews its lease, so an in-flight job is detected as
  // stuck only once its lock is free (crashed/expired) AND its status has not
  // changed for a grace period — fast recovery without racing live jobs.
  const inProgressCutoff = new Date(nowMs - config.HYPERV_STUCK_INPROGRESS_MS);

  const stuckPending = await VM.find({
    hyperVStatus: 'pending',
    enableVirtualization: true,
    ...hyperVLockFree(now),
    ...statusChangedBeforeCutoff(pendingCutoff),
  })
    .select('_id node vmid name adminId hyperVStatus hyperVAttemptCount enableVirtualization')
    .limit(SWEEP_BATCH)
    .lean();

  for (const vm of stuckPending) {
    await handleStuckVm(vm, 'enable');
  }

  const stuckEnabling = await VM.find({
    hyperVStatus: 'enabling',
    enableVirtualization: true,
    ...hyperVLockFree(now),
    ...statusChangedBeforeCutoff(inProgressCutoff),
  })
    .select('_id node vmid name adminId hyperVStatus hyperVAttemptCount enableVirtualization')
    .limit(SWEEP_BATCH)
    .lean();

  for (const vm of stuckEnabling) {
    await handleStuckVm(vm, 'enable');
  }

  const stuckDisabling = await VM.find({
    hyperVStatus: 'disabling',
    ...hyperVLockFree(now),
    ...statusChangedBeforeCutoff(inProgressCutoff),
  })
    .select('_id node vmid name adminId hyperVStatus hyperVAttemptCount')
    .limit(SWEEP_BATCH)
    .lean();

  for (const vm of stuckDisabling) {
    await handleStuckVm(vm, 'disable');
  }
}
