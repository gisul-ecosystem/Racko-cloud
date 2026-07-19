import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { VM } from '../vm/vm.model';
import { ExternalVMModel } from '../external-vm/external-vm.model';
import { logger } from '../../utils/logger';
import { ConflictError, NotFoundError, ForbiddenError } from '../../utils/errors';
import type {
  CreateSingleUserDto,
  CreateBulkUsersDto,
  ManagedUserProfile,
  BulkCreateResult,
} from './managedUsers.types';

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure random password.
 * Format: 12 chars — guaranteed to contain upper, lower, digit, symbol.
 * Uses crypto.randomBytes — never Math.random.
 */
function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;

  const pick = (charset: string): string =>
    charset[crypto.randomInt(charset.length)]!;

  // Guarantee at least one of each required character class
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];

  // Fill remaining 8 chars from full charset
  const rest = Array.from({ length: 8 }, () => pick(all));

  // Shuffle using Fisher-Yates with crypto.randomInt
  const combined = [...required, ...rest];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [combined[i], combined[j]] = [combined[j]!, combined[i]!];
  }

  return combined.join('');
}

/**
 * Build numbered emails from a prefix email.
 * e.g. "user@gmail.com", index 3 → "user3@gmail.com"
 */
function buildEmail(emailPrefix: string, index: number): string {
  const atIdx = emailPrefix.lastIndexOf('@');
  const local = emailPrefix.slice(0, atIdx);
  const domain = emailPrefix.slice(atIdx);
  return `${local}${index}${domain}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ManagedUsersService {
  /**
   * Admin creates a single user.
   * - isEmailVerified: true (admin-provisioned, no verification needed)
   * - role: 'user'
   * - createdBy: adminId
   */
  async createSingle(
    dto: CreateSingleUserDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<ManagedUserProfile> {
    const existing = await User.findOne({ email: dto.email.toLowerCase().trim() });
    if (existing) {
      throw new ConflictError(`Email already in use: ${dto.email}`);
    }

    const user = await User.create({
      email: dto.email.toLowerCase().trim(),
      password: dto.password,
      role: 'user',
      isEmailVerified: true,   // admin-provisioned — no verification required
      isActive: true,
      createdBy: adminId,
    });

    logger.info('Admin created user', {
      adminId: adminId.toString(),
      userId: user._id.toString(),
      email: user.email,
    });

    return {
      id: user._id.toString(),
      email: user.email,
      role: 'user',
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * Admin creates N users with a numbered email prefix.
   * Returns plain-text passwords once — never stored in plain text.
   * Skips duplicates and records them as failed rather than aborting the whole batch.
   */
  async createBulk(
    dto: CreateBulkUsersDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<BulkCreateResult> {
    const results: BulkCreateResult['users'] = [];
    let created = 0;
    let failed = 0;

    for (let i = 1; i <= dto.count; i++) {
      const email = buildEmail(dto.emailPrefix, i);
      const plainPassword = dto.password ?? generateSecurePassword();

      try {
        const existing = await User.findOne({ email });
        if (existing) {
          results.push({ email, password: plainPassword, status: 'failed', error: 'Email already in use' });
          failed++;
          continue;
        }

        await User.create({
          email,
          password: plainPassword,
          role: 'user',
          isEmailVerified: true,
          isActive: true,
          createdBy: adminId,
        });

        results.push({ email, password: plainPassword, status: 'created' });
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ email, password: plainPassword, status: 'failed', error: msg });
        failed++;
        logger.warn('Failed to create user in bulk', { email, adminId: adminId.toString(), error: msg });
      }
    }

    logger.info('Bulk user creation complete', {
      adminId: adminId.toString(),
      created,
      failed,
      total: dto.count,
    });

    return { created, failed, users: results };
  }

  /**
   * List all users created by this admin.
   */
  async listMyUsers(adminId: mongoose.Types.ObjectId): Promise<ManagedUserProfile[]> {
    const users = await User.find({ createdBy: adminId, role: 'user' })
      .select('-password -emailVerificationToken -emailVerificationExpires -failedLoginAttempts')
      .sort({ createdAt: -1 });

    return users.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      role: 'user' as const,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  /**
   * Toggle a user's active status.
   * Admin can only manage users they created.
   */
  async setUserActive(
    targetUserId: string,
    isActive: boolean,
    adminId: mongoose.Types.ObjectId
  ): Promise<ManagedUserProfile> {
    const user = await User.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');
    if (user.role !== 'user') throw new ForbiddenError('Can only manage user-role accounts.');
    if (!user.createdBy || user.createdBy.toString() !== adminId.toString()) {
      throw new ForbiddenError('You can only manage users you created.');
    }

    user.isActive = isActive;
    await user.save();

    return {
      id: user._id.toString(),
      email: user.email,
      role: 'user',
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * Delete a user. Admin can only delete users they created.
   */
  async deleteUser(
    targetUserId: string,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const user = await User.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');
    if (user.role !== 'user') throw new ForbiddenError('Can only delete user-role accounts.');
    if (!user.createdBy || user.createdBy.toString() !== adminId.toString()) {
      throw new ForbiddenError('You can only delete users you created.');
    }

    const unassignResult = await VM.updateMany(
      { assignedTo: user._id, adminId },
      { $unset: { assignedTo: 1 } }
    );

    const externalUnassignResult = await ExternalVMModel.updateMany(
      { assignedTo: user._id, adminId },
      { $unset: { assignedTo: 1 } }
    );

    await user.deleteOne();

    logger.info('Admin deleted user', {
      adminId: adminId.toString(),
      deletedUserId: targetUserId,
      email: user.email,
      vmsUnassigned: unassignResult.modifiedCount,
      externalVmsUnassigned: externalUnassignResult.modifiedCount,
    });
  }
}

export const managedUsersService = new ManagedUsersService();
