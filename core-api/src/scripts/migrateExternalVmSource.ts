/**
 * Backfill ExternalVM.source for existing rows:
 * - tenantId set → 'tenant_import'
 * - adminId set  → 'admin_import'
 *
 * Does not touch username fields (left null for existing users).
 *
 * Run: npx ts-node src/scripts/migrateExternalVmSource.ts
 *   or: npm run migrate:external-vm-source
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ExternalVMModel } from '../modules/external-vm/external-vm.model';

async function migrateExternalVmSource(): Promise<void> {
  console.log('Starting ExternalVM.source backfill...');
  await connectDatabase();

  const tenantResult = await ExternalVMModel.updateMany(
    {
      tenantId: { $exists: true, $ne: null },
      $or: [{ source: { $exists: false } }, { source: null }],
    },
    { $set: { source: 'tenant_import' } }
  );

  const adminResult = await ExternalVMModel.updateMany(
    {
      adminId: { $exists: true, $ne: null },
      $or: [{ source: { $exists: false } }, { source: null }],
    },
    { $set: { source: 'admin_import' } }
  );

  const stillMissing = await ExternalVMModel.countDocuments({
    $or: [{ source: { $exists: false } }, { source: null }],
  });

  console.log(`tenant_import set: ${tenantResult.modifiedCount}`);
  console.log(`admin_import set:  ${adminResult.modifiedCount}`);
  if (stillMissing > 0) {
    console.warn(
      `WARNING: ${stillMissing} ExternalVM row(s) still missing source (no adminId/tenantId?)`
    );
  }

  await disconnectDatabase();
  console.log('Done.');
}

migrateExternalVmSource().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Migration failed:', message);
  mongoose.disconnect().finally(() => process.exit(1));
});
