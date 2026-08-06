import mongoose from 'mongoose';
import { ExternalVMModel } from '../external-vm/external-vm.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';

const migratedTenants = new Set<string>();

/** Upsert legacy single-user assignments into the junction table (once per tenant). */
export async function migrateLegacyExternalVmAssignments(
  tenantId: mongoose.Types.ObjectId
): Promise<void> {
  const key = tenantId.toString();
  if (migratedTenants.has(key)) return;
  migratedTenants.add(key);

  const legacy = await ExternalVMModel.find({
    tenantId,
    assignedTenantUserId: { $ne: null },
  })
    .select('_id assignedTenantUserId createdByTenantUserId updatedAt')
    .lean();

  if (legacy.length === 0) return;

  await Promise.all(
    legacy.map((doc) =>
      ExternalVmTenantAssignmentModel.updateOne(
        {
          tenantId,
          externalVmId: doc._id,
          tenantUserId: doc.assignedTenantUserId!,
        },
        {
          $setOnInsert: {
            assignedByTenantUserId: doc.createdByTenantUserId,
            createdAt: doc.updatedAt ?? new Date(),
          },
        },
        { upsert: true }
      )
    )
  );
}

export async function isExternalVmAssignedToTenantUser(input: {
  tenantId: mongoose.Types.ObjectId;
  externalVmId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
}): Promise<boolean> {
  const hit = await ExternalVmTenantAssignmentModel.exists({
    tenantId: input.tenantId,
    externalVmId: input.externalVmId,
    tenantUserId: input.tenantUserId,
  });
  return Boolean(hit);
}

export async function getExternalVmIdsForTenantUser(
  tenantId: mongoose.Types.ObjectId,
  tenantUserId: mongoose.Types.ObjectId
): Promise<mongoose.Types.ObjectId[]> {
  const rows = await ExternalVmTenantAssignmentModel.find({ tenantId, tenantUserId })
    .select('externalVmId')
    .lean();
  return rows.map((r) => r.externalVmId);
}

export async function getTenantUserIdsForExternalVm(
  tenantId: mongoose.Types.ObjectId,
  externalVmId: mongoose.Types.ObjectId
): Promise<string[]> {
  const rows = await ExternalVmTenantAssignmentModel.find({ tenantId, externalVmId })
    .select('tenantUserId')
    .lean();
  return rows.map((r) => r.tenantUserId.toString());
}

export async function getAssignmentCountsByTenantUser(
  tenantId: mongoose.Types.ObjectId
): Promise<Record<string, number>> {
  const results = await ExternalVmTenantAssignmentModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    count: number;
  }>([{ $match: { tenantId } }, { $group: { _id: '$tenantUserId', count: { $sum: 1 } } }]);

  const map: Record<string, number> = {};
  for (const r of results) {
    map[r._id.toString()] = r.count;
  }
  return map;
}

export async function getAssignmentMapForExternalVms(
  tenantId: mongoose.Types.ObjectId,
  externalVmIds: mongoose.Types.ObjectId[]
): Promise<Map<string, string[]>> {
  if (externalVmIds.length === 0) return new Map();

  const rows = await ExternalVmTenantAssignmentModel.find({
    tenantId,
    externalVmId: { $in: externalVmIds },
  })
    .select('externalVmId tenantUserId')
    .lean();

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const vmId = row.externalVmId.toString();
    const list = map.get(vmId) ?? [];
    list.push(row.tenantUserId.toString());
    map.set(vmId, list);
  }
  return map;
}

export async function createExternalVmTenantAssignments(input: {
  tenantId: mongoose.Types.ObjectId;
  externalVmIds: mongoose.Types.ObjectId[];
  tenantUserId: mongoose.Types.ObjectId;
  assignedByTenantUserId: mongoose.Types.ObjectId;
}): Promise<number> {
  let created = 0;
  for (const externalVmId of input.externalVmIds) {
    const result = await ExternalVmTenantAssignmentModel.updateOne(
      {
        tenantId: input.tenantId,
        externalVmId,
        tenantUserId: input.tenantUserId,
      },
      {
        $setOnInsert: {
          assignedByTenantUserId: input.assignedByTenantUserId,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) created++;
  }
  return created;
}

export async function removeExternalVmTenantAssignment(input: {
  tenantId: mongoose.Types.ObjectId;
  externalVmId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
}): Promise<boolean> {
  const result = await ExternalVmTenantAssignmentModel.deleteOne({
    tenantId: input.tenantId,
    externalVmId: input.externalVmId,
    tenantUserId: input.tenantUserId,
  });
  return result.deletedCount > 0;
}

export async function removeAllExternalVmAssignmentsForUser(
  tenantId: mongoose.Types.ObjectId,
  tenantUserId: mongoose.Types.ObjectId
): Promise<number> {
  const result = await ExternalVmTenantAssignmentModel.deleteMany({ tenantId, tenantUserId });
  return result.deletedCount ?? 0;
}

export async function removeAllExternalVmAssignmentsForVms(
  tenantId: mongoose.Types.ObjectId,
  externalVmIds: mongoose.Types.ObjectId[]
): Promise<number> {
  if (externalVmIds.length === 0) return 0;
  const result = await ExternalVmTenantAssignmentModel.deleteMany({
    tenantId,
    externalVmId: { $in: externalVmIds },
  });
  return result.deletedCount ?? 0;
}

/** Keep legacy column in sync for older code paths (first assignee only). */
export async function syncLegacyAssignedTenantUserId(
  tenantId: mongoose.Types.ObjectId,
  externalVmId: mongoose.Types.ObjectId
): Promise<void> {
  const userIds = await getTenantUserIdsForExternalVm(tenantId, externalVmId);
  const primary = userIds[0]
    ? new mongoose.Types.ObjectId(userIds[0])
    : undefined;
  await ExternalVMModel.updateOne(
    { _id: externalVmId, tenantId },
    primary
      ? { $set: { assignedTenantUserId: primary } }
      : { $unset: { assignedTenantUserId: 1 } }
  );
}
