import crypto from 'crypto';
import mongoose from 'mongoose';
import { TenantUser } from '../../models/tenantUser.model';
import { VM } from '../vm/vm.model';
import { logger } from '../../utils/logger';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { hashPassword } from '../../utils/argon2';
import type {
  BulkCreateTenantUsersResult,
  CreateBulkTenantUsersDto,
  CreateSingleTenantUserDto,
  TenantUserProfile,
} from './tenantUser.types';

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;

  const pick = (charset: string): string => charset[crypto.randomInt(charset.length)]!;
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 8 }, () => pick(all));
  const combined = [...required, ...rest];

  for (let i = combined.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [combined[i], combined[j]] = [combined[j]!, combined[i]!];
  }

  return combined.join('');
}

function buildEmail(emailPrefix: string, index: number): string {
  const atIdx = emailPrefix.lastIndexOf('@');
  const local = emailPrefix.slice(0, atIdx);
  const domain = emailPrefix.slice(atIdx);
  return `${local}${index}${domain}`;
}

function toTenantUserProfile(user: {
  _id: mongoose.Types.ObjectId;
  email: string;
  tenantId: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
}): TenantUserProfile {
  return {
    id: user._id.toString(),
    email: user.email,
    role: 'tenant_user',
    tenantId: user.tenantId.toString(),
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

export class TenantUserService {
  async createSingle(
    dto: CreateSingleTenantUserDto,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<TenantUserProfile> {
    const email = dto.email.toLowerCase().trim();
    const existing = await TenantUser.findOne({ tenantId, email });
    if (existing) {
      throw new ConflictError(`Email already in use: ${dto.email}`);
    }

    const user = await TenantUser.create({
      tenantId,
      email,
      passwordHash: await hashPassword(dto.password),
      role: 'tenant_user',
      isActive: true,
      isEmailVerified: true,
      createdBy,
    });

    logger.info('Tenant admin created tenant user', {
      tenantId: tenantId.toString(),
      createdBy: createdBy.toString(),
      tenantUserId: user._id.toString(),
      email: user.email,
    });

    return toTenantUserProfile(user);
  }

  async createBulk(
    dto: CreateBulkTenantUsersDto,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<BulkCreateTenantUsersResult> {
    const results: BulkCreateTenantUsersResult['users'] = [];
    let created = 0;
    let failed = 0;

    for (let i = 1; i <= dto.count; i++) {
      const email = buildEmail(dto.emailPrefix, i);
      const plainPassword = dto.password ?? generateSecurePassword();

      try {
        const existing = await TenantUser.findOne({ tenantId, email });
        if (existing) {
          results.push({ email, password: plainPassword, status: 'failed', error: 'Email already in use' });
          failed++;
          continue;
        }

        await TenantUser.create({
          tenantId,
          email,
          passwordHash: await hashPassword(plainPassword),
          role: 'tenant_user',
          isActive: true,
          isEmailVerified: true,
          createdBy,
        });

        results.push({ email, password: plainPassword, status: 'created' });
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ email, password: plainPassword, status: 'failed', error: msg });
        failed++;
        logger.warn('Failed to create tenant user in bulk', {
          tenantId: tenantId.toString(),
          createdBy: createdBy.toString(),
          email,
          error: msg,
        });
      }
    }

    logger.info('Bulk tenant user creation complete', {
      tenantId: tenantId.toString(),
      createdBy: createdBy.toString(),
      created,
      failed,
      total: dto.count,
    });

    return { created, failed, users: results };
  }

  async listMyUsers(
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<TenantUserProfile[]> {
    const users = await TenantUser.find({ tenantId, role: 'tenant_user', createdBy }).sort({ createdAt: -1 });
    return users.map(toTenantUserProfile);
  }

  async setUserActive(
    targetUserId: string,
    isActive: boolean,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<TenantUserProfile> {
    const user = await TenantUser.findOne({
      _id: new mongoose.Types.ObjectId(targetUserId),
      tenantId,
      role: 'tenant_user',
    });

    if (!user) throw new NotFoundError('Tenant user not found.');
    if (!user.createdBy || user.createdBy.toString() !== createdBy.toString()) {
      throw new ForbiddenError('You can only manage tenant users you created.');
    }

    user.isActive = isActive;
    await user.save();

    return toTenantUserProfile(user);
  }

  async deleteUser(
    targetUserId: string,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<void> {
    const user = await TenantUser.findOne({
      _id: new mongoose.Types.ObjectId(targetUserId),
      tenantId,
      role: 'tenant_user',
    });

    if (!user) throw new NotFoundError('Tenant user not found.');
    if (!user.createdBy || user.createdBy.toString() !== createdBy.toString()) {
      throw new ForbiddenError('You can only delete tenant users created by a tenant admin.');
    }

    const unassignResult = await VM.updateMany(
      { tenantId, assignedTenantUserId: user._id },
      { $unset: { assignedTenantUserId: 1 } }
    );

    await user.deleteOne();

    logger.info('Tenant user deleted', {
      tenantId: tenantId.toString(),
      tenantUserId: targetUserId,
      email: user.email,
      vmsUnassigned: unassignResult.modifiedCount,
    });
  }
}

export const tenantUserService = new TenantUserService();
