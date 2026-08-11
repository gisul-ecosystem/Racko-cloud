/**
 * Backfill `my-vms` service entitlement for all existing org-owner admins and tenants.
 *
 * - Admin orgs:  inserts AdminServiceConfig { adminId, serviceKey:'my-vms', status:'active' }
 *                for every org-owner (role:'admin', orgOwnerId:null) that doesn't already have it.
 * - Tenant orgs: inserts TenantServiceConfig { tenantId, serviceKey:'my-vms', status:'active' }
 *                for every Tenant that doesn't already have it.
 *
 * Already-existing rows are skipped (upsert / duplicate key ignored).
 * Super Admin can toggle the entitlement per org via the Access Control UI afterwards.
 *
 * Run:
 *   npm run migrate:backfill-my-vms
 *   -- or --
 *   npx ts-node src/scripts/migrateBackfillMyVms.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { AdminServiceConfig } from '../models/adminServiceConfig.model';
import { TenantServiceConfig } from '../models/tenantServiceConfig.model';
import { User } from '../models/user.model';
import { Tenant } from '../models/tenant.model';

const SERVICE_KEY = 'my-vms';

async function backfillAdmins(): Promise<{ inserted: number; skipped: number }> {
  // Only org-owners own an AdminServiceConfig row; managed users share via orgOwnerId lookup.
  const orgOwners = await User.find({ role: 'admin', orgOwnerId: null })
    .select('_id')
    .lean();

  if (orgOwners.length === 0) return { inserted: 0, skipped: 0 };

  const existingAdminIds = await AdminServiceConfig.distinct('adminId', {
    serviceKey: SERVICE_KEY,
  });
  const existingSet = new Set(existingAdminIds.map(String));

  const missing = orgOwners.filter((u) => !existingSet.has(u._id.toString()));
  if (missing.length === 0) return { inserted: 0, skipped: orgOwners.length };

  const docs = missing.map((u) => ({
    adminId: u._id,
    serviceKey: SERVICE_KEY,
    status: 'active' as const,
  }));

  const result = await AdminServiceConfig.insertMany(docs, { ordered: false }).catch(
    (err: unknown) => {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        // Partial duplicates — return what was inserted
        const writeResult = (err as { insertedDocs?: unknown[] })?.insertedDocs;
        return writeResult ?? [];
      }
      throw err;
    }
  );

  const inserted = Array.isArray(result) ? result.length : 0;
  return { inserted, skipped: orgOwners.length - missing.length };
}

async function backfillTenants(): Promise<{ inserted: number; skipped: number }> {
  const tenants = await Tenant.find({}).select('_id').lean();
  if (tenants.length === 0) return { inserted: 0, skipped: 0 };

  const existingTenantIds = await TenantServiceConfig.distinct('tenantId', {
    serviceKey: SERVICE_KEY,
  });
  const existingSet = new Set(existingTenantIds.map(String));

  const missing = tenants.filter((t) => !existingSet.has(t._id.toString()));
  if (missing.length === 0) return { inserted: 0, skipped: tenants.length };

  // TenantServiceConfig requires a createdBy field — use a system ObjectId placeholder.
  const systemId = new mongoose.Types.ObjectId('000000000000000000000000');

  const docs = missing.map((t) => ({
    tenantId: t._id,
    serviceKey: SERVICE_KEY,
    status: 'active' as const,
    limits: {},
    pricing: {},
    createdBy: systemId,
  }));

  const result = await TenantServiceConfig.insertMany(docs, { ordered: false }).catch(
    (err: unknown) => {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        const writeResult = (err as { insertedDocs?: unknown[] })?.insertedDocs;
        return writeResult ?? [];
      }
      throw err;
    }
  );

  const inserted = Array.isArray(result) ? result.length : 0;
  return { inserted, skipped: tenants.length - missing.length };
}

async function run(): Promise<void> {
  console.log(`Backfilling '${SERVICE_KEY}' service entitlement…`);
  await connectDatabase();

  const adminStats = await backfillAdmins();
  console.log(
    `Admin orgs  — inserted: ${adminStats.inserted}, already present: ${adminStats.skipped}`
  );

  const tenantStats = await backfillTenants();
  console.log(
    `Tenant orgs — inserted: ${tenantStats.inserted}, already present: ${tenantStats.skipped}`
  );

  await disconnectDatabase();
  console.log('Done.');
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Migration failed:', message);
  mongoose.disconnect().finally(() => process.exit(1));
});
