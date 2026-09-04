import mongoose from 'mongoose';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { guacamoleClient } from '../../utils/guacamoleClient';
import { cancelExternalAssignmentTimer } from '../vmAccessSchedule/scheduleManager';
import { ExternalVMModel } from './external-vm.model';
import { User } from '../../models/user.model';
import { TenantUser } from '../../models/tenantUser.model';

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
      if (err instanceof NotFoundError || err instanceof ConflictError) {
        return { id, success: false, error: message };
      }
      logger.error('[SuperAdminExternalVM] delete failed', { id, error: message });
      return { id, success: false, error: message };
    }
  }

  async bulkDelete(ids: string[]): Promise<SuperAdminExternalVmBulkDeleteResult> {
    const uniqueIds = [...new Set(ids)];

    // Validate and split into known/unknown ids in one query.
    const validObjectIds = uniqueIds.filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const foundVms = validObjectIds.length
      ? await ExternalVMModel.find({ _id: { $in: validObjectIds } })
          .select('_id tenantId assignedTo assignedTenantUserId inventoryLocked')
          .lean()
      : [];
    const foundIdSet = new Set(foundVms.map((v) => v._id.toString()));

    const missingResults: SuperAdminExternalVmDeleteItemResult[] = uniqueIds
      .filter((id) => !foundIdSet.has(id))
      .map((id) => ({ id, success: false, error: 'External VM not found.' }));

    const lockedVms = foundVms.filter((v) => Boolean(v.inventoryLocked));
    const unlockedVms = foundVms.filter((v) => !v.inventoryLocked);
    const lockedResults: SuperAdminExternalVmDeleteItemResult[] = lockedVms.map((v) => ({
      id: v._id.toString(),
      success: false,
      error: 'VM is locked and cannot be deleted from inventory.',
    }));

    if (unlockedVms.length === 0) {
      const failedResults = [...lockedResults, ...missingResults];
      return {
        results: failedResults,
        summary: { total: uniqueIds.length, deleted: 0, failed: uniqueIds.length },
      };
    }

    const foundOids = unlockedVms.map((v) => v._id as mongoose.Types.ObjectId);

    // Fetch all assignments for this batch in two queries (include user ids for cascade).
    const [platformAssigns, tenantAssigns] = await Promise.all([
      ExternalVmUserAssignmentModel.find({ externalVmId: { $in: foundOids } })
        .select('_id externalVmId userId')
        .lean(),
      ExternalVmTenantAssignmentModel.find({ externalVmId: { $in: foundOids } })
        .select('_id externalVmId tenantUserId')
        .lean(),
    ]);

    // Cancel all in-memory timers before any DB delete.
    for (const row of platformAssigns) cancelExternalAssignmentTimer(row._id.toString(), 'platform');
    for (const row of tenantAssigns) cancelExternalAssignmentTimer(row._id.toString(), 'tenant');

    // Fire Guac cleanup in parallel — skip if connection never existed (both helpers are no-ops
    // when the connection is not found).
    await Promise.all(
      unlockedVms.map(async (vm) => {
        const connectionName = externalVmConnectionName(vm._id.toString());
        try {
          await guacamoleClient.killActiveSessionsForConnection(connectionName);
        } catch (err) {
          logger.warn('[SuperAdminExternalVM] Guacamole kill sessions failed', {
            externalVmId: vm._id.toString(),
            error: err instanceof Error ? err.message : String(err),
          });
        }
        try {
          await guacamoleClient.deleteConnectionByName(connectionName);
        } catch (err) {
          logger.warn('[SuperAdminExternalVM] Guacamole connection delete failed', {
            externalVmId: vm._id.toString(),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    // Bulk-delete assignments then VMs in three operations.
    await Promise.all([
      ExternalVmUserAssignmentModel.deleteMany({ externalVmId: { $in: foundOids } }),
      ExternalVmTenantAssignmentModel.deleteMany({ externalVmId: { $in: foundOids } }),
    ]);
    await ExternalVMModel.deleteMany({ _id: { $in: foundOids } });

    // Collect unique user ids from both junction rows and legacy fields, then cascade.
    const platformUserIds = [
      ...new Set([
        ...platformAssigns.map((a) => a.userId.toString()),
        ...unlockedVms.filter((v) => v.assignedTo).map((v) => v.assignedTo!.toString()),
      ]),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const tenantUserIds = [
      ...new Set([
        ...tenantAssigns.map((a) => a.tenantUserId.toString()),
        ...unlockedVms.filter((v) => v.assignedTenantUserId).map((v) => v.assignedTenantUserId!.toString()),
      ]),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const { deletedPlatformUsers, deletedTenantUsers } =
      await this.cascadeDeleteOrphanedUsers(platformUserIds, tenantUserIds);

    logger.info('[SuperAdminExternalVM] Bulk-deleted external VMs', {
      count: unlockedVms.length,
      skippedLocked: lockedVms.length,
      platformAssignments: platformAssigns.length,
      tenantAssignments: tenantAssigns.length,
      deletedPlatformUsers,
      deletedTenantUsers,
    });

    const successResults: SuperAdminExternalVmDeleteItemResult[] = unlockedVms.map((v) => ({
      id: v._id.toString(),
      success: true,
    }));

    const allResults = [...successResults, ...lockedResults, ...missingResults];
    const deleted = successResults.length;
    return {
      results: allResults,
      summary: { total: uniqueIds.length, deleted, failed: uniqueIds.length - deleted },
    };
  }

  private async deleteExternalVmDocument(id: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError('External VM not found.');
    }

    const externalVmId = new mongoose.Types.ObjectId(id);
    const vm = await ExternalVMModel.findById(externalVmId);
    if (!vm) throw new NotFoundError('External VM not found.');
    if (vm.inventoryLocked) {
      throw new ConflictError('VM is locked and cannot be deleted from inventory.');
    }

    const connectionName = externalVmConnectionName(externalVmId.toString());

    const [platformAssigns, tenantAssigns] = await Promise.all([
      ExternalVmUserAssignmentModel.find({ externalVmId }).select('_id userId').lean(),
      ExternalVmTenantAssignmentModel.find({ externalVmId }).select('_id tenantUserId').lean(),
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

    // Cascade: delete any user whose only VM was this one.
    const platformUserIds = [
      ...new Set([
        ...platformAssigns.map((a) => a.userId.toString()),
        ...(vm.assignedTo ? [vm.assignedTo.toString()] : []),
      ]),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const tenantUserIds = [
      ...new Set([
        ...tenantAssigns.map((a) => a.tenantUserId.toString()),
        ...(vm.assignedTenantUserId ? [vm.assignedTenantUserId.toString()] : []),
      ]),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const { deletedPlatformUsers, deletedTenantUsers } =
      await this.cascadeDeleteOrphanedUsers(platformUserIds, tenantUserIds);

    logger.info('[SuperAdminExternalVM] Deleted external VM', {
      externalVmId: id,
      stack: vm.tenantId ? 'tenant' : 'platform',
      platformAssignments: platformAssigns.length,
      tenantAssignments: tenantAssigns.length,
      deletedPlatformUsers,
      deletedTenantUsers,
    });
  }
  /** Delete end-user accounts that have no remaining VM assignments after their VM was deleted. */
  private async cascadeDeleteOrphanedUsers(
    platformUserIds: mongoose.Types.ObjectId[],
    tenantUserIds: mongoose.Types.ObjectId[]
  ): Promise<{ deletedPlatformUsers: number; deletedTenantUsers: number }> {
    let deletedPlatformUsers = 0;
    let deletedTenantUsers = 0;

    await Promise.all(
      platformUserIds.map(async (userId) => {
        // Check for any remaining assignment row (any status) or legacy field.
        const [hasAssignment, hasLegacy] = await Promise.all([
          ExternalVmUserAssignmentModel.exists({ userId }),
          ExternalVMModel.exists({ assignedTo: userId }),
        ]);
        if (hasAssignment || hasLegacy) return;

        const user = await User.findById(userId).select('role orgOwnerId').lean();
        // Only delete managed end-users; never delete admins or org operators.
        if (!user || user.role !== 'user') return;

        await User.deleteOne({ _id: userId });
        deletedPlatformUsers++;
        logger.info('[SuperAdminExternalVM] Cascade-deleted orphaned platform user', {
          userId: userId.toString(),
        });
      })
    );

    await Promise.all(
      tenantUserIds.map(async (tenantUserId) => {
        const [hasAssignment, hasLegacy] = await Promise.all([
          ExternalVmTenantAssignmentModel.exists({ tenantUserId }),
          ExternalVMModel.exists({ assignedTenantUserId: tenantUserId }),
        ]);
        if (hasAssignment || hasLegacy) return;

        const user = await TenantUser.findById(tenantUserId).select('role').lean();
        // Only delete tenant end-users; never delete tenant admins.
        if (!user || user.role !== 'tenant_user') return;

        await TenantUser.deleteOne({ _id: tenantUserId });
        deletedTenantUsers++;
        logger.info('[SuperAdminExternalVM] Cascade-deleted orphaned tenant user', {
          tenantUserId: tenantUserId.toString(),
        });
      })
    );

    return { deletedPlatformUsers, deletedTenantUsers };
  }
}

export const superAdminExternalVmDeleteService = new SuperAdminExternalVmDeleteService();

