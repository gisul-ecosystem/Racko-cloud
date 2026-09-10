/**
 * Remove the old external-server import data from the elastic-server collections.
 *
 * `externalvms` holds two unrelated things. The old admin and tenant imports
 * (`source: 'admin_import' | 'tenant_import'`) are the retired flow and are what
 * this clears. The rows written by the VM Inventory (`source: 'superadmin_bulk'`)
 * are mirrors, and they are the only reason a tenant user can see an assigned VM
 * at all — deleting those would blank the tenant portal, so they are left alone.
 *
 * That is also why the collections themselves are not dropped: the mirror
 * service upserts into them on every assignment, so Mongo would recreate them
 * immediately and a drop would only have destroyed the live mirrors on the way
 * through. Purging by `source` reaches the same end state and holds.
 *
 * Grants are deleted before their VMs so a failure part-way cannot leave a
 * grant pointing at a VM that no longer exists.
 *
 * Dry-run by default — it prints what it would delete and changes nothing.
 *
 * Run: npx ts-node src/scripts/purgeLegacyExternalVms.ts
 *      npx ts-node src/scripts/purgeLegacyExternalVms.ts --commit
 *   or: npm run purge:legacy-external-vms
 *       npm run purge:legacy-external-vms -- --commit
 */
import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ExternalVMModel } from '../modules/external-vm/external-vm.model';
import { ExternalVmTenantAssignmentModel } from '../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../models/externalVmUserAssignment.model';

const commit = process.argv.includes('--commit');

/** The retired import flows. Everything else in there stays. */
const LEGACY_SOURCES = ['admin_import', 'tenant_import'];

async function purgeLegacyExternalVms(): Promise<void> {
  console.log(
    commit
      ? 'Purging legacy external-server imports (COMMIT)...'
      : 'Purging legacy external-server imports (dry run — pass --commit to delete)...'
  );
  await connectDatabase();

  const bySource = await ExternalVMModel.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$source', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log('\nexternalvms by source:');
  if (bySource.length === 0) console.log('  (empty)');
  for (const row of bySource) {
    const keep = LEGACY_SOURCES.includes(row._id) ? 'DELETE' : 'keep';
    console.log(`  ${(row._id ?? 'unset').padEnd(18)} ${String(row.count).padStart(6)}  ${keep}`);
  }

  const legacy = await ExternalVMModel.find({ source: { $in: LEGACY_SOURCES } })
    .select('_id')
    .lean();
  const legacyIds = legacy.map((d) => d._id);

  if (legacyIds.length === 0) {
    console.log('\nNothing to purge — no legacy imports left.');
    await disconnectDatabase();
    return;
  }

  const [userGrants, tenantGrants] = await Promise.all([
    ExternalVmUserAssignmentModel.countDocuments({ externalVmId: { $in: legacyIds } }),
    ExternalVmTenantAssignmentModel.countDocuments({ externalVmId: { $in: legacyIds } }),
  ]);

  console.log(`\nWould delete:`);
  console.log(`  externalvms                    ${legacyIds.length}`);
  console.log(`  externalvmuserassignments      ${userGrants}`);
  console.log(`  externalvmtenantassignments    ${tenantGrants}`);

  // Orphan grants exist if a VM was removed without its grants. Reported so the
  // count above is not mistaken for the whole cleanup.
  const [orphanUser, orphanTenant] = await Promise.all([
    ExternalVmUserAssignmentModel.countDocuments({
      externalVmId: { $nin: await ExternalVMModel.distinct('_id') },
    }),
    ExternalVmTenantAssignmentModel.countDocuments({
      externalVmId: { $nin: await ExternalVMModel.distinct('_id') },
    }),
  ]);
  if (orphanUser + orphanTenant > 0) {
    console.log(
      `\nAlso found ${orphanUser + orphanTenant} grant(s) pointing at a VM that no longer exists.` +
        ' Left in place — deleting them is a separate call.'
    );
  }

  if (!commit) {
    console.log('\nDry run — nothing deleted. Re-run with --commit.');
    await disconnectDatabase();
    return;
  }

  const grants = await Promise.all([
    ExternalVmUserAssignmentModel.deleteMany({ externalVmId: { $in: legacyIds } }),
    ExternalVmTenantAssignmentModel.deleteMany({ externalVmId: { $in: legacyIds } }),
  ]);
  const vms = await ExternalVMModel.deleteMany({ _id: { $in: legacyIds } });

  console.log('\nDeleted:');
  console.log(`  externalvms                    ${vms.deletedCount}`);
  console.log(`  externalvmuserassignments      ${grants[0].deletedCount}`);
  console.log(`  externalvmtenantassignments    ${grants[1].deletedCount}`);

  const remaining = await ExternalVMModel.countDocuments({});
  console.log(`\n${remaining} record(s) left in externalvms (inventory mirrors).`);

  await disconnectDatabase();
}

purgeLegacyExternalVms()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Purge failed:', err);
    process.exit(1);
  });
