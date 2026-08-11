import mongoose from 'mongoose';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { guacamoleClient } from '../../utils/guacamoleClient';
import { cancelExternalAssignmentTimer } from '../vmAccessSchedule/scheduleManager';
import { ExternalVMModel } from './external-vm.model';

export interface SuperAdminExternalVmDeleteItemResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface SuperAdminExternalVmBulkDeleteResult {
  results: SuperAdminExternalVmDeleteItemResult[];
  summary: {
    total: number;
    deleted: number;
    failed: number;
  };
}

function externalVmConnectionName(externalVmId: string): string {
  return `externalvm-${externalVmId}`;
}

class SuperAdminExternalVmDeleteService {
  async deleteOne(id: string): Promise<SuperAdminExternalVmDeleteItemResult> {
    try {
      await this.deleteExternalVmDocument(id);
      return { id, success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof NotFoundError) {
        return { id, success: false, error: message };
      }
      logger.error('[SuperAdminExternalVM] delete failed', { id, error: message });
      return { id, success: false, error: message };
    }
  }

  async bulkDelete(ids: string[]): Promise<SuperAdminExternalVmBulkDeleteResult> {
    const uniqueIds = [...new Set(ids)];
    const results: SuperAdminExternalVmDeleteItemResult[] = [];

    for (const id of uniqueIds) {
      results.push(await this.deleteOne(id));
    }

    const deleted = results.filter((r) => r.success).length;
    return {
      results,
      summary: {
        total: uniqueIds.length,
        deleted,
        failed: uniqueIds.length - deleted,
      },
    };
  }

  private async deleteExternalVmDocument(id: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError('External VM not found.');
    }

    const externalVmId = new mongoose.Types.ObjectId(id);
    const vm = await ExternalVMModel.findById(externalVmId);
    if (!vm) throw new NotFoundError('External VM not found.');

    const connectionName = externalVmConnectionName(externalVmId.toString());

    const [platformAssigns, tenantAssigns] = await Promise.all([
      ExternalVmUserAssignmentModel.find({ externalVmId }).select('_id').lean(),
      ExternalVmTenantAssignmentModel.find({ externalVmId }).select('_id').lean(),
    ]);

    for (const row of platformAssigns) {
      cancelExternalAssignmentTimer(row._id.toString(), 'platform');
    }
    for (const row of tenantAssigns) {
      cancelExternalAssignmentTimer(row._id.toString(), 'tenant');
    }

    try {
      await guacamoleClient.killActiveSessionsForConnection(connectionName);
    } catch (err) {
      logger.warn('[SuperAdminExternalVM] Guacamole kill sessions failed (continuing delete)', {
        externalVmId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await Promise.all([
      ExternalVmUserAssignmentModel.deleteMany({ externalVmId }),
      ExternalVmTenantAssignmentModel.deleteMany({ externalVmId }),
    ]);

    try {
      await guacamoleClient.deleteConnectionByName(connectionName);
    } catch (err) {
      logger.warn('[SuperAdminExternalVM] Guacamole connection delete failed (continuing delete)', {
        externalVmId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await ExternalVMModel.deleteOne({ _id: externalVmId });

    logger.info('[SuperAdminExternalVM] Deleted external VM', {
      externalVmId: id,
      stack: vm.tenantId ? 'tenant' : 'platform',
      platformAssignments: platformAssigns.length,
      tenantAssignments: tenantAssigns.length,
    });
  }
}

export const superAdminExternalVmDeleteService = new SuperAdminExternalVmDeleteService();
