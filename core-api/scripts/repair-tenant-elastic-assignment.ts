/**
 * Repair a tenant elastic server ↔ end-user assignment (console 403 after SA import).
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/repair-tenant-elastic-assignment.ts <externalVmId> <tenantUserEmail>
 *
 * Example:
 *   npx ts-node --transpile-only scripts/repair-tenant-elastic-assignment.ts 6a83fb66cf00472785466ef2 virtualvm8@gisul.local
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { ExternalVMModel } from '../src/modules/external-vm/external-vm.model';
import { ExternalVmTenantAssignmentModel } from '../src/models/externalVmTenantAssignment.model';
import { TenantUser } from '../src/models/tenantUser.model';
import { syncLegacyAssignedTenantUserId } from '../src/modules/external-vm/externalVmTenantAssignment.service';

async function main(): Promise<void> {
  const externalVmIdRaw = process.argv[2];
  const emailRaw = process.argv[3];

  if (!externalVmIdRaw || !emailRaw) {
    console.error(
      'Usage: npx ts-node --transpile-only scripts/repair-tenant-elastic-assignment.ts <externalVmId> <tenantUserEmail>'
    );
    process.exit(1);
  }

  if (!mongoose.Types.ObjectId.isValid(externalVmIdRaw)) {
    console.error('Invalid externalVmId');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'iaas_platform';
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName });

  const externalVmId = new mongoose.Types.ObjectId(externalVmIdRaw);
  const email = emailRaw.trim().toLowerCase();

  const vm = await ExternalVMModel.findById(externalVmId).lean();
  if (!vm?.tenantId) {
    console.error('External VM not found or has no tenantId');
    process.exit(1);
  }

  const tenantUser = await TenantUser.findOne({
    tenantId: vm.tenantId,
    email,
    role: 'tenant_user',
  })
    .select('_id email tenantId')
    .lean();

  if (!tenantUser) {
    console.error(`Tenant user not found in tenant ${vm.tenantId}: ${email}`);
    process.exit(1);
  }

  const result = await ExternalVmTenantAssignmentModel.updateOne(
    {
      tenantId: vm.tenantId,
      externalVmId,
      tenantUserId: tenantUser._id,
    },
    {
      $set: { status: 'active' },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  await ExternalVMModel.updateOne(
    { _id: externalVmId, tenantId: vm.tenantId },
    { $set: { assignedTenantUserId: tenantUser._id } }
  );
  await syncLegacyAssignedTenantUserId(vm.tenantId, externalVmId);

  console.log('Repair complete:', {
    externalVmId: externalVmId.toString(),
    tenantId: vm.tenantId.toString(),
    tenantUserId: tenantUser._id.toString(),
    email: tenantUser.email,
    upserted: result.upsertedCount > 0,
    modified: result.modifiedCount > 0,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
