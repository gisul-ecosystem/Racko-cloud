import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { hashPassword, verifyPassword } from '../../utils/argon2';
import { generateSecureToken, hashToken } from '../../utils/crypto';
import { config } from '../../config';
import type {
  TenantForgotPasswordInput,
  TenantLoginInput,
  TenantResetPasswordInput,
} from './tenantAuth.validation';

export interface TenantTokenPayload {
  sub: string;
  tenantId: string;
  role: 'tenant_admin' | 'tenant_user';
  type: 'tenant';
}

export interface TenantUserPublic {
  id: string;
  email: string;
  role: 'tenant_admin' | 'tenant_user';
  tenantId: string;
}

function signTenantAccessToken(payload: TenantTokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_TENANT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

// TODO: Wire real email delivery (SendGrid or equivalent) for tenant password resets.
export function sendTenantPasswordResetEmail(
  tenantUser: { email: string },
  rawToken: string
): void {
  console.log('[STUB] Password reset token for', tenantUser.email, ':', rawToken);
}

export class TenantAuthService {
  async login(
    tenantId: string,
    dto: TenantLoginInput
  ): Promise<{ accessToken: string; tenantUser: TenantUserPublic }> {
    const tenant = await Tenant.findById(tenantId).select('status').lean();
    if (!tenant || tenant.status !== 'active') {
      throw new TenantAuthError('INVALID_CREDENTIALS', 401);
    }

    const email = dto.email.toLowerCase().trim();
    const tenantUser = await TenantUser.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      email,
    }).select('+passwordHash');

    if (!tenantUser || !tenantUser.isActive) {
      throw new TenantAuthError('INVALID_CREDENTIALS', 401);
    }

    const passwordValid = await verifyPassword(tenantUser.passwordHash, dto.password);
    if (!passwordValid) {
      throw new TenantAuthError('INVALID_CREDENTIALS', 401);
    }

    const accessToken = signTenantAccessToken({
      sub: tenantUser._id.toString(),
      tenantId: tenantUser.tenantId.toString(),
      role: tenantUser.role,
      type: 'tenant',
    });

    return {
      accessToken,
      tenantUser: {
        id: tenantUser._id.toString(),
        email: tenantUser.email,
        role: tenantUser.role,
        tenantId: tenantUser.tenantId.toString(),
      },
    };
  }

  async forgotPassword(tenantId: string, dto: TenantForgotPasswordInput): Promise<void> {
    const tenantUser = await TenantUser.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      email: dto.email,
    });

    if (!tenantUser) {
      return;
    }

    const rawToken = generateSecureToken(32);
    tenantUser.resetTokenHash = hashToken(rawToken);
    tenantUser.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await tenantUser.save();

    sendTenantPasswordResetEmail(tenantUser, rawToken);
  }

  async resetPassword(tenantId: string, dto: TenantResetPasswordInput): Promise<void> {
    const hashedToken = hashToken(dto.token);

    const tenantUser = await TenantUser.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      resetTokenHash: hashedToken,
      resetTokenExpiresAt: { $gt: new Date() },
    });

    if (!tenantUser) {
      throw new TenantAuthError('INVALID_OR_EXPIRED_TOKEN', 400);
    }

    tenantUser.passwordHash = await hashPassword(dto.newPassword);
    tenantUser.resetTokenHash = null;
    tenantUser.resetTokenExpiresAt = null;
    await tenantUser.save();
  }
}

export class TenantAuthError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const tenantAuthService = new TenantAuthService();
