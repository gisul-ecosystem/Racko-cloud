/**
 * One-time customer account-type migration:
 * - Existing customer accounts (admin/user, not staff/super_admin) → Individual (b2c)
 * - gisul2102@gmail.com → Organization (b2b)
 *
 * Run: npx ts-node src/scripts/migrateCustomerAccountTypes.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../models/user.model';

const ORG_EMAIL = 'gisul2102@gmail.com';

async function migrateCustomerAccountTypes(): Promise<void> {
  console.log('Starting customer account-type migration...');
  await connectDatabase();

  const individualResult = await User.updateMany(
    {
      role: { $in: ['admin', 'user'] },
      email: { $ne: ORG_EMAIL },
      $or: [{ accountType: { $exists: false } }, { accountType: 'legacy' }, { accountType: null }],
    },
    {
      $set: {
        accountType: 'b2c',
        onboardingStatus: 'active',
      },
    }
  );

  const orgUser = await User.findOneAndUpdate(
    { email: ORG_EMAIL.toLowerCase() },
    {
      $set: {
        accountType: 'b2b',
        onboardingStatus: 'org_approved',
      },
    },
    { new: true }
  );

  // Also ensure any already-tagged non-org customers that were left as legacy are fixed
  const catchAllIndividuals = await User.updateMany(
    {
      role: { $in: ['admin', 'user'] },
      email: { $ne: ORG_EMAIL },
      accountType: { $nin: ['b2b'] },
    },
    {
      $set: {
        accountType: 'b2c',
      },
    }
  );

  console.log(`Individuals updated (legacy→b2c): ${individualResult.modifiedCount}`);
  console.log(`Catch-all individuals set to b2c: ${catchAllIndividuals.modifiedCount}`);
  if (orgUser) {
    console.log(`Organization set: ${orgUser.email} → ${orgUser.accountType} / ${orgUser.onboardingStatus}`);
  } else {
    console.warn(`Organization email not found: ${ORG_EMAIL}`);
  }

  await disconnectDatabase();
  console.log('Done.');
}

migrateCustomerAccountTypes().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Migration failed:', message);
  mongoose.disconnect().finally(() => process.exit(1));
});
