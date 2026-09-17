import mongoose from 'mongoose';
import { logger } from '../../utils/logger';
import type { IProject } from '../../models/project.model';
import { CredentialAssignmentModel } from '../../models/credentialAssignment.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { DedicatedServerRequestModel } from '../../models/dedicatedServerRequest.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { ExternalVMModel } from '../external-vm/external-vm.model';
import { externalVMService } from '../external-vm/external-vm.service';
import { removeAllExternalVmAssignmentsForVms } from '../external-vm/externalVmTenantAssignment.service';
import { VM } from '../vm/vm.model';
import { vmService } from '../vm/vm.service';
import { tenantVmService } from '../tenantVm/tenantVm.service';
import { vmInventoryAssignmentService } from '../vmInventory/vmInventoryAssignment.service';

export interface ProjectExpiryCleanupResult {
  inventoryUnassigned: number;
  externalOrgUnassigned: number;
  externalTenantUnassigned: number;
  managedOrgUnassigned: number;
  managedTenantUnassigned: number;
  projectLinksCleared: number;
  errors: string[];
}

export async function runProjectExpiryCleanup(
  project: IProject
): Promise<ProjectExpiryCleanupResult> {
  const projectId = project._id;
  const result: ProjectExpiryCleanupResult = {
    inventoryUnassigned: 0,
    externalOrgUnassigned: 0,
    externalTenantUnassigned: 0,
    managedOrgUnassigned: 0,
    managedTenantUnassigned: 0,
    projectLinksCleared: 0,
    errors: [],
  };

  const inventoryAssignments = await CredentialAssignmentModel.find({
    projectId,
    status: 'active',
  })
    .select('_id')
    .lean();

  for (const assignment of inventoryAssignments) {
    try {
      await vmInventoryAssignmentService.unassign(assignment._id.toString());
      result.inventoryUnassigned += 1;
    } catch (err) {
      result.errors.push(
        `Inventory assignment ${assignment._id.toString()}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const externalVms = await ExternalVMModel.find({ projectId }).select(
    '_id adminId tenantId assignedTo assignedTenantUserId inventoryLocked'
  );

  const orgExternalIds: mongoose.Types.ObjectId[] = [];
  const tenantExternalByTenant = new Map<string, mongoose.Types.ObjectId[]>();

  for (const vm of externalVms) {
    if (vm.tenantId) {
      const key = vm.tenantId.toString();
      const list = tenantExternalByTenant.get(key) ?? [];
      list.push(vm._id);
      tenantExternalByTenant.set(key, list);
      continue;
    }

    orgExternalIds.push(vm._id);
    if (!vm.adminId) continue;

    try {
      if (vm.assignedTo) {
        await externalVMService.unassignExternalVM(vm._id, vm.adminId);
        result.externalOrgUnassigned += 1;
      }
      await ExternalVmUserAssignmentModel.deleteMany({
        externalVmId: vm._id,
        status: 'active',
      });
    } catch (err) {
      result.errors.push(
        `Elastic server ${vm._id.toString()}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  for (const [tenantId, ids] of tenantExternalByTenant) {
    try {
      const removed = await removeAllExternalVmAssignmentsForVms(
        new mongoose.Types.ObjectId(tenantId),
        ids
      );
      result.externalTenantUnassigned += removed;
    } catch (err) {
      result.errors.push(
        `Tenant elastic cleanup (${tenantId}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const managedVms = await VM.find({ projectId }).select(
    '_id adminId tenantId assignedTo assignedTenantUserId'
  );

  for (const vm of managedVms) {
    try {
      if (vm.tenantId && vm.assignedTenantUserId) {
        await tenantVmService.unassignVm(vm._id, vm.tenantId);
        result.managedTenantUnassigned += 1;
      } else if (vm.adminId && vm.assignedTo) {
        await vmService.unassignVM(vm._id, vm.adminId);
        result.managedOrgUnassigned += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('not currently assigned')) {
        result.errors.push(`Managed VM ${vm._id.toString()}: ${message}`);
      }
    }
  }

  const [catalogRes, dedicatedRes, externalRes, managedRes] = await Promise.all([
    CatalogVmModel.updateMany({ projectId }, { $unset: { projectId: '' } }),
    DedicatedServerRequestModel.updateMany({ projectId }, { $unset: { projectId: '' } }),
    ExternalVMModel.updateMany(
      { projectId },
      {
        $unset: {
          projectId: '',
          assignedTo: '',
          assignedTenantUserId: '',
        },
      }
    ),
    VM.updateMany({ projectId }, { $unset: { projectId: '' } }),
  ]);

  result.projectLinksCleared =
    (catalogRes.modifiedCount ?? 0) +
    (dedicatedRes.modifiedCount ?? 0) +
    (externalRes.modifiedCount ?? 0) +
    (managedRes.modifiedCount ?? 0);

  logger.info('[ProjectExpiry] Cleanup completed', {
    projectId: projectId.toString(),
    ...result,
  });

  return result;
}
