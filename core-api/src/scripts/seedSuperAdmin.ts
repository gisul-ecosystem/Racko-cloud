/**
 * Super Admin Seed Script
 * Run once: npx ts-node src/scripts/seedSuperAdmin.ts
 * Idempotent — skips if super_admin already exists.
 * NEVER expose this as an API endpoint.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../models/user.model';

async function seedSuperAdmin(): Promise<void> {
  console.log('🌱 Starting super_admin seed...');

  await connectDatabase();

  const existing = await User.findOne({ role: 'super_admin' });

  if (existing) {
    console.log('✅ super_admin already exists — skipping seed.');
    await disconnectDatabase();
    return;
  }

  const superAdmin = new User({
    email: config.SUPER_ADMIN_EMAIL,
    password: config.SUPER_ADMIN_PASSWORD, // pre-save hook hashes with argon2id
    role: 'super_admin',
    isEmailVerified: true,
    isActive: true,
    isLocked: false,
    failedLoginAttempts: 0,
  });

  await superAdmin.save();

  console.log(`✅ super_admin created: ${config.SUPER_ADMIN_EMAIL}`);
  console.log('⚠  Store the password securely. This script should not be run again.');

  await disconnectDatabase();
}

seedSuperAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('❌ Seed failed:', message);
  mongoose.disconnect().finally(() => process.exit(1));
});
