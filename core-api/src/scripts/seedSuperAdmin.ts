/**
 * Super Admin Seed Script
 * Run once: npm run seed
 * Upserts by SUPER_ADMIN_EMAIL — creates or updates password/role.
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

  const email = config.SUPER_ADMIN_EMAIL.toLowerCase().trim();
  const password = config.SUPER_ADMIN_PASSWORD;

  const existing = await User.findOne({ email }).select('+password');

  if (existing) {
    existing.password = password; // pre-save hook re-hashes
    existing.role = 'super_admin';
    existing.isEmailVerified = true;
    existing.isActive = true;
    existing.isLocked = false;
    existing.failedLoginAttempts = 0;
    existing.lockedUntil = undefined;
    await existing.save();
    console.log(`✅ super_admin updated: ${email}`);
  } else {
    const superAdmin = new User({
      email,
      password, // pre-save hook hashes with argon2id
      role: 'super_admin',
      isEmailVerified: true,
      isActive: true,
      isLocked: false,
      failedLoginAttempts: 0,
    });
    await superAdmin.save();
    console.log(`✅ super_admin created: ${email}`);
  }

  console.log('⚠  Store the password securely.');
  await disconnectDatabase();
}

seedSuperAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('❌ Seed failed:', message);
  mongoose.disconnect().finally(() => process.exit(1));
});
