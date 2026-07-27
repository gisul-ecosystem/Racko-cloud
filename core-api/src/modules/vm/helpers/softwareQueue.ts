import mongoose from 'mongoose';
import { logger } from '../../../utils/logger';
import { installSoftwareForVM } from './softwareProvisioner';

export type SoftwareJobParams = {
  vmObjectId: mongoose.Types.ObjectId;
  node: string;
  vmid: number;
  adminId: mongoose.Types.ObjectId;
  vmName: string;
};

/**
 * Schedule software installation for a single VM (single_create jobs only).
 */
export function scheduleSoftwareInstall(params: SoftwareJobParams): void {
  void installSoftwareForVM(params).catch((err: unknown) => {
    logger.error('[Software] install crashed', {
      vmid: params.vmid,
      node: params.node,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
