import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { hashPassword, verifyPassword } from '../../utils/argon2';
import { generateSecureToken, hashToken } from '../../utils/crypto';
import { config } from '../../config';
import {
  sendTenantPasswordResetEmail,
  sendTenantVerificationEmail,
} from '../../utils/email/sender';
import type {
  TenantForgotPasswordInput,
  TenantLoginInput,
  TenantResendVerificationInput,
  TenantResetPasswordInput,
  TenantVerifyEmailInput,
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
  /** True for Access-control invited operators (and always for tenant_admin). */
  isConsoleOperator: boolean;
}

function signTenantAccessToken(payload: TenantTokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_TENANT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
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

    if (!tenantUser.isEmailVerified) {
      throw new TenantAuthError(
        'Please verify your email address before logging in. Check your inbox for the verification link.',
        403,
        'EMAIL_NOT_VERIFIED'
      );
    }

    if (tenantUser.mustSetPassword) {
      throw new TenantAuthError(
        'Your account has been verified, but you must set a new password before logging in. Use the invite email or password reset flow.',
        403,
        'PASSWORD_SETUP_REQUIRED'
      );
    }

    const isConsoleOperator =
      tenantUser.role === 'tenant_admin' || Boolean(tenantUser.isConsoleOperator);

    // End-user access window gate — not applied to console operators.
    if (tenantUser.role === 'tenant_user' && !tenantUser.isConsoleOperator) {
      const {
        assertTenantUserAssignedVmsAccessible,
      } = await import('../vmAccessSchedule/scheduleManager');
      const { AccessWindowDeniedError } = await import('../../utils/errors');
      const access = await assertTenantUserAssignedVmsAccessible(tenantUser._id.toString());
      if (!access.allowed) {
        throw new AccessWindowDeniedError(
          access.error || 'Access denied: outside scheduled window.',
          access.nextWindow ?? null
        );
      }
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
        isConsoleOperator,
      },
    };
  }

  /**
   * Verify invite/email token. Enumeration-safe message for invalid tokens.
   */
  async verifyEmail(
    tenantId: string,
    dto: TenantVerifyEmailInput
  ): Promise<{ message: string }> {
    const hashedToken = hashToken(dto.token);

    const tenantUser = await TenantUser.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      emailVerificationTokenHash: hashedToken,
      emailVerificationExpiresAt: { $gt: new Date() },
    }).select('+emailVerificationTokenHash');

    if (!tenantUser || !tenantUser.isActive) {
      throw new TenantAuthError('Verification link is invalid or has expired.', 400, 'INVALID_TOKEN');
    }

    const requiresPasswordSetup = Boolean(tenantUser.mustSetPassword);
    tenantUser.isEmailVerified = true;
    tenantUser.emailVerificationTokenHash = null;
    tenantUser.emailVerificationExpiresAt = null;
    await tenantUser.save();

    return {
      message: requiresPasswordSetup
        ? 'Email verified successfully. Now set your password from the invite email before logging in.'
        : 'Email verified successfully. You can now log in.',
    };
  }

  /**
   * Resend verification for unverified console accounts. Always succeeds (enumeration-safe).
   */
  async resendVerification(tenantId: string, dto: TenantResendVerificationInput): Promise<void> {
    const email = dto.email.toLowerCase().trim();
    const tenantUser = await TenantUser.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      email,
    }).select('+emailVerificationTokenHash');

    if (!tenantUser || !tenantUser.isActive || tenantUser.isEmailVerified) {
      return;
    }

    const rawToken = generateSecureToken(32);
    tenantUser.emailVerificationTokenHash = hashToken(rawToken);
    tenantUser.emailVerificationExpiresAt = new Date(
      Date.now() + config.EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000
    );
    await tenantUser.save();

    const tenant = await Tenant.findById(tenantId).select('name domain branding').lean();
    if (tenant) {
      await sendTenantVerificationEmail({
        to: tenantUser.email,
        rawToken,
        tenant: {
          name: tenant.name,
          domain: tenant.domain,
          branding: tenant.branding,
        },
      });
    }
  }

  async forgotPassword(tenantId: string, dto: TenantForgotPasswordInput): Promise<void> {
    const tenantUser = await TenantUser.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      email: dto.email,
    });

    if (!tenantUser || !tenantUser.isActive) {
      return;
    }

    const rawToken = generateSecureToken(32);
    tenantUser.resetTokenHash = hashToken(rawToken);
    tenantUser.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await tenantUser.save();

    const tenant = await Tenant.findById(tenantId).select('name domain branding').lean();
    if (tenant) {
      await sendTenantPasswordResetEmail({
        to: tenantUser.email,
        rawToken,
        tenant: {
          name: tenant.name,
          domain: tenant.domain,
          branding: tenant.branding,
        },
      });
    }
  }

  async resetPassword(tenantId: string, dto: TenantResetPasswordInput): Promise<void> {
    const hashedToken = hashToken(dto.token);

    const tenantUser = await TenantUser.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      resetTokenHash: hashedToken,
      resetTokenExpiresAt: { $gt: new Date() },
    });

    if (!tenantUser || !tenantUser.isActive) {
      throw new TenantAuthError('INVALID_OR_EXPIRED_TOKEN', 400);
    }

    tenantUser.passwordHash = await hashPassword(dto.newPassword);
    tenantUser.resetTokenHash = null;
    tenantUser.resetTokenExpiresAt = null;
    tenantUser.mustSetPassword = false;
    await tenantUser.save();
  }

  async accessCheck(
    tenantUserId: string,
    role: 'tenant_admin' | 'tenant_user'
  ): Promise<{ allowed: boolean }> {
    if (role !== 'tenant_user') {
      return { allowed: true };
    }

    const {
      assertTenantUserAssignedVmsAccessible,
    } = await import('../vmAccessSchedule/scheduleManager');
    const { UnauthorizedError } = await import('../../utils/errors');
    const access = await assertTenantUserAssignedVmsAccessible(tenantUserId);
    if (!access.allowed) {
      throw new UnauthorizedError('Session expired: access window ended.');
    }
    return { allowed: true };
  }
}

export class TenantAuthError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const tenantAuthService = new TenantAuthService();
