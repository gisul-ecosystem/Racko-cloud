import mongoose from 'mongoose';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { installSoftwareForVM } from './softwareProvisioner';

// QUEUE_SLOT: replace with BullMQ/RabbitMQ job for multi-instance deployments

export type SoftwareJobParams = {
  vmObjectId: mongoose.Types.ObjectId;
  node: string;
  vmid: number;
  adminId: mongoose.Types.ObjectId;
  vmName: string;
};

let active = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<() => void> {
  const max = config.SOFTWARE_MAX_CONCURRENT;
  if (active < max) {
    active++;
    return releaseSlot;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
  return releaseSlot;
}

function releaseSlot(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

/**
 * Schedule software installation in the background.
 * Fire-and-forget — status is tracked per-package on the VM document.
 */
export function scheduleSoftwareInstall(params: SoftwareJobParams): void {
  void runInstallJob(params).catch((err: unknown) => {
    logger.error('[Software] queued install crashed', {
      vmid: params.vmid,
      node: params.node,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runInstallJob(params: SoftwareJobParams): Promise<void> {
  const release = await acquireSlot();
  try {
    await installSoftwareForVM(params);
  } finally {
    release();
  }
}
