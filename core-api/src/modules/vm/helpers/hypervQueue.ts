import mongoose from 'mongoose';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { VM } from '../vm.model';
import { acquireHyperVSlot } from './hypervConcurrency';
import { withHyperVLock } from './hypervLock';
import { provisionHyperVForVM, disableHyperVForVM } from './hypervProvisioner';
export type HyperVJobParams = {
  vmObjectId: mongoose.Types.ObjectId;
  node: string;
  vmid: number;
  adminId: mongoose.Types.ObjectId;
  vmName: string;
};

/** Atomically claim `pending` → `enabling` (bulk-created VMs). */
export async function claimHyperVPending(vmObjectId: mongoose.Types.ObjectId): Promise<boolean> {
  const now = new Date();
  const doc = await VM.findOneAndUpdate(
    { _id: vmObjectId, hyperVStatus: 'pending' },
    {
      $set: {
        hyperVStatus: 'enabling',
        hyperVLastError: '',
        hyperVStatusChangedAt: now,
      },
    },
    { new: true }
  );
  return doc != null;
}

/**
 * Run Hyper-V enable in the background with concurrency limiting and single-flight.
 * @param alreadyEnabling — API/sweeper already set `enabling` (manual enable / retry).
 */
export function scheduleHyperVEnable(params: HyperVJobParams, alreadyEnabling = false): void {
  void runEnableJob(params, alreadyEnabling).catch((err: unknown) => {
    logger.error('[HyperV] queued enable crashed', {
      vmid: params.vmid,
      node: params.node,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runEnableJob(params: HyperVJobParams, alreadyEnabling: boolean): Promise<void> {
  const release = await acquireHyperVSlot(config.HYPERV_MAX_CONCURRENT);
  try {
    if (!alreadyEnabling) {
      const claimed = await claimHyperVPending(params.vmObjectId);
      if (!claimed) {
        const vm = await VM.findById(params.vmObjectId).select('hyperVStatus').lean();
        if (!vm || vm.hyperVStatus !== 'enabling') {
          logger.info('[HyperV] skip enable — not claimable', {
            vmid: params.vmid,
            status: vm?.hyperVStatus,
          });
          return;
        }
      }
    }
    await withHyperVLock(
      params.vmObjectId,
      { vmid: params.vmid, node: params.node },
      () => provisionHyperVForVM(params)
    );
  } finally {
    release();
  }
}

/** Run Hyper-V disable in the background with concurrency limiting. */
export function scheduleHyperVDisable(params: HyperVJobParams, alreadyDisabling = false): void {
  void runDisableJob(params, alreadyDisabling).catch((err: unknown) => {
    logger.error('[HyperV] queued disable crashed', {
      vmid: params.vmid,
      node: params.node,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runDisableJob(params: HyperVJobParams, alreadyDisabling: boolean): Promise<void> {
  const release = await acquireHyperVSlot(config.HYPERV_MAX_CONCURRENT);
  try {
    if (!alreadyDisabling) {
      const vm = await VM.findById(params.vmObjectId).select('hyperVStatus').lean();
      if (!vm || vm.hyperVStatus !== 'disabling') {
        logger.info('[HyperV] skip disable — not in disabling state', {
          vmid: params.vmid,
          status: vm?.hyperVStatus,
        });
        return;
      }
    }
    await withHyperVLock(
      params.vmObjectId,
      { vmid: params.vmid, node: params.node },
      () => disableHyperVForVM(params)
    );
  } finally {
    release();
  }
}
