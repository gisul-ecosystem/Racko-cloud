import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { Token } from '../../models/token.model';
import { AuditLog } from '../../models/auditLog.model';
import { verifyPassword, DUMMY_HASH } from '../../utils/argon2';
import {
  generateSecureToken,
  hashToken,
  generateSessionId,
  generateTokenFamily,
} from '../../utils/crypto';
import { parseDuration } from '../../utils/parseDuration';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../../utils/jwt';
import { generateFingerprint, getClientIp } from '../../utils/deviceFingerprint';
import {
  sendVerificationEmail,
  sendLoginAlertEmail,
  sendAccountLockedEmail,
  sendPasswordResetEmail,
} from '../../utils/email/sender';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import {
  UnauthorizedError,
  AccountLockedError,
  EmailNotVerifiedError,
  RegistrationUnavailableError,
  AppError,
} from '../../utils/errors';
import type { RegisterDto, LoginDto, LoginResult, TokenValidationResult } from './auth.types';
import type { UserRole } from '../../types';
import { adminServicesService } from '../adminServices/adminServices.service';

/** Secure only on HTTPS — HTTP sites must not set Secure cookies. */
function isRefreshCookieSecure(): boolean {
  try {
    return new URL(config.FRONTEND_URL).protocol === 'https:';
  } catch {
    return false;
  }
}

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isRefreshCookieSecure(),
    sameSite: 'strict' as const,
    maxAge: parseDuration(config.JWT_REFRESH_EXPIRES_IN),
    path: '/',
  };
}

function getRefreshCookieClearOptions() {
  return {
    httpOnly: true,
    secure: isRefreshCookieSecure(),
    sameSite: 'strict' as const,
    path: '/',
  };
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie('refreshToken', getRefreshCookieClearOptions());
}

function getCookieDebugMeta(req: Request): {
  cookieHeaderPresent: boolean;
  cookieNames: string[];
  hasRefreshTokenCookie: boolean;
  refreshTokenLength: number;
} {
  const cookieHeader = req.headers.cookie ?? '';
  const cookieNames = cookieHeader
    .split(';')
    .map((part) => part.trim().split('=')[0] ?? '')
    .filter((name) => name.length > 0);
  const rawRefreshToken = req.cookies?.['refreshToken'] as string | undefined;

  return {
    cookieHeaderPresent: cookieHeader.length > 0,
    cookieNames,
    hasRefreshTokenCookie: !!rawRefreshToken,
    refreshTokenLength: rawRefreshToken?.length ?? 0,
  };
}

function logAuthToken(event: string, meta: Record<string, unknown>): void {
  logger.info(`[auth-token] ${event}`, meta);
}

export class AuthService {
  /**
   * Register a new admin user.
   * Verified duplicates return 409 (counts toward gateway failed-only rate limit).
   * Unverified duplicates resend the verification email without revealing account state.
   */
  async register(data: RegisterDto, req: Request): Promise<{ message: string }> {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    const fingerprint = generateFingerprint(req);

    const existingUser = await User.findOne({ email: data.email });

    if (existingUser?.isEmailVerified) {
      await AuditLog.create({
        event: 'REGISTER_FAILED',
        ipAddress: ip,
        userAgent,
        deviceFingerprint: fingerprint,
        metadata: { reason: 'email_already_registered', email: data.email },
      });
      throw new RegistrationUnavailableError();
    }

    const rawToken = generateSecureToken(32);
    const hashedToken = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + config.EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000
    );

    if (existingUser && !existingUser.isEmailVerified) {
      existingUser.emailVerificationToken = hashedToken;
      existingUser.emailVerificationExpires = expiresAt;
      await existingUser.save();

      await sendVerificationEmail(data.email, rawToken);

      await AuditLog.create({
        userId: existingUser._id,
        event: 'EMAIL_VERIFICATION_SENT',
        ipAddress: ip,
        userAgent,
        deviceFingerprint: fingerprint,
        metadata: { reason: 'resend_unverified' },
      });

      return { message: 'We\'ve sent a verification link to your email address.' };
    }

    const user = new User({
      email: data.email,
      password: data.password, // pre-save hook hashes with argon2id
      role: 'admin',
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: expiresAt,
    });

    await user.save();

    // New platform admins only get VM Catalog + Dedicated Server by default
    try {
      await adminServicesService.seedDefaultsForNewAdmin(user._id);
    } catch (seedErr) {
      logger.warn('[Auth] Failed to seed admin services on register', {
        userId: user._id.toString(),
        error: seedErr instanceof Error ? seedErr.message : String(seedErr),
      });
    }

    await sendVerificationEmail(data.email, rawToken);

    await AuditLog.create({
      userId: user._id,
      event: 'REGISTER',
      ipAddress: ip,
      userAgent,
      deviceFingerprint: fingerprint,
      metadata: { email: data.email },
    });

    await AuditLog.create({
      userId: user._id,
      event: 'EMAIL_VERIFICATION_SENT',
      ipAddress: ip,
      userAgent,
      deviceFingerprint: fingerprint,
    });

    // EVENT_SLOT: emit 'user.registered' event to message queue

    return { message: 'We\'ve sent a verification link to your email address.' };
  }

  /**
   * Verify email with token from email link.
   */
  async verifyEmail(token: string, req: Request): Promise<{ message: string }> {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    const fingerprint = generateFingerprint(req);

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: new Date() },
    }).select('+emailVerificationToken');

    if (!user) {
      throw new AppError('Verification link is invalid or has expired.', 400, 'INVALID_TOKEN');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    await AuditLog.create({
      userId: user._id,
      event: 'EMAIL_VERIFIED',
      ipAddress: ip,
      userAgent,
      deviceFingerprint: fingerprint,
    });

    return { message: 'Email verified successfully. You can now log in.' };
  }

  /**
   * Login with email and password.
   * Returns access token in body, sets refresh token in HttpOnly cookie.
   */
  async login(data: LoginDto, req: Request, res: Response): Promise<LoginResult> {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    const fingerprint = generateFingerprint(req);

    // Always find user with password for timing consistency
    const user = await User.findByEmail(data.email);

    // Timing attack prevention: always run argon2 verify even if user not found
    if (!user) {
      await verifyPassword(DUMMY_HASH, data.password);
      await AuditLog.create({
        event: 'LOGIN_FAILED',
        ipAddress: ip,
        userAgent,
        deviceFingerprint: fingerprint,
        metadata: { reason: 'user_not_found' },
      });
      throw new UnauthorizedError('Invalid email or password.');
    }

    // Check account active
    if (!user.isActive) {
      await verifyPassword(DUMMY_HASH, data.password);
      throw new UnauthorizedError('Invalid email or password.');
    }

    // Check account locked
    if (user.isLocked && user.lockedUntil) {
      if (user.lockedUntil > new Date()) {
        await verifyPassword(DUMMY_HASH, data.password);
        throw new AccountLockedError(user.lockedUntil);
      } else {
        // Auto-unlock expired
        user.isLocked = false;
        user.lockedUntil = undefined;
        user.failedLoginAttempts = 0;
        await user.save();

        await AuditLog.create({
          userId: user._id,
          event: 'ACCOUNT_UNLOCKED',
          ipAddress: ip,
          userAgent,
          deviceFingerprint: fingerprint,
          metadata: { reason: 'auto_unlock' },
        });
      }
    }

    // Check email verified
    if (!user.isEmailVerified) {
      await verifyPassword(DUMMY_HASH, data.password);
      await AuditLog.create({
        userId: user._id,
        event: 'LOGIN_BLOCKED_UNVERIFIED',
        ipAddress: ip,
        userAgent,
        deviceFingerprint: fingerprint,
      });
      throw new EmailNotVerifiedError();
    }

    // Verify password
    const isPasswordValid = await verifyPassword(user.password, data.password);

    if (!isPasswordValid) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= config.MAX_LOGIN_ATTEMPTS) {
        user.isLocked = true;
        user.lockedUntil = new Date(Date.now() + config.LOCK_DURATION_MINUTES * 60 * 1000);

        await user.save();

        // Send account locked email
        await sendAccountLockedEmail(user.email, {
          email: user.email,
          lockedUntil: user.lockedUntil,
          ipAddress: ip,
        });

        await AuditLog.create({
          userId: user._id,
          event: 'ACCOUNT_LOCKED',
          ipAddress: ip,
          userAgent,
          deviceFingerprint: fingerprint,
          metadata: { failedAttempts: user.failedLoginAttempts },
        });

        throw new AccountLockedError(user.lockedUntil);
      }

      await user.save();

      await AuditLog.create({
        userId: user._id,
        event: 'LOGIN_FAILED',
        ipAddress: ip,
        userAgent,
        deviceFingerprint: fingerprint,
        metadata: { failedAttempts: user.failedLoginAttempts },
      });

      throw new UnauthorizedError('Invalid email or password.');
    }

    // Password correct — reset failed attempts
    user.failedLoginAttempts = 0;
    user.isLocked = false;
    user.lockedUntil = undefined;

    // End-user access window gate (assigned VMs with schedule)
    if (user.role === 'user') {
      const {
        assertUserAssignedVmsAccessible,
      } = await import('../vmAccessSchedule/scheduleManager');
      const { AccessWindowDeniedError } = await import('../../utils/errors');
      const access = await assertUserAssignedVmsAccessible(user._id.toString());
      if (!access.allowed) {
        throw new AccessWindowDeniedError(
          access.error || 'Access denied: outside scheduled window.',
          access.nextWindow ?? null
        );
      }
    }

    // Detect suspicious login (new IP or new device)
    const isNewIp = user.lastLoginIp && user.lastLoginIp !== ip;
    const isNewDevice = user.lastLoginDevice && user.lastLoginDevice !== fingerprint;

    if (isNewIp || isNewDevice) {
      await sendLoginAlertEmail(user.email, {
        email: user.email,
        ipAddress: ip,
        userAgent,
        timestamp: new Date(),
      });

      await AuditLog.create({
        userId: user._id,
        event: 'SUSPICIOUS_LOGIN',
        ipAddress: ip,
        userAgent,
        deviceFingerprint: fingerprint,
        metadata: { previousIp: user.lastLoginIp, previousDevice: user.lastLoginDevice },
      });
    }

    // Generate tokens
    const sessionId = generateSessionId();
    const family = generateTokenFamily();
    const rawRefreshToken = generateSecureToken(32);
    const hashedRefreshToken = hashToken(rawRefreshToken);

    const accessToken = signAccessToken({
      userId: user._id.toString(),
      role: user.role,
      sessionId,
    });

    const refreshTokenJwt = signRefreshToken({
      userId: user._id.toString(),
      family,
      tokenId: hashedRefreshToken,
    });

    // Store hashed refresh token in DB
    const refreshExpiresAt = new Date(Date.now() + parseDuration(config.JWT_REFRESH_EXPIRES_IN));
    await Token.create({
      userId: user._id,
      tokenHash: hashedRefreshToken,
      family,
      deviceFingerprint: fingerprint,
      isRevoked: false,
      expiresAt: refreshExpiresAt,
      ipAddress: ip,
      userAgent,
    });

    // Update user login info
    user.lastLoginAt = new Date();
    user.lastLoginIp = ip;
    user.lastLoginDevice = fingerprint;
    await user.save();

    // Set refresh token in HttpOnly cookie — never in response body
    res.cookie('refreshToken', refreshTokenJwt, getRefreshCookieOptions());

    logAuthToken('login:refresh-cookie-set', {
      userId: user._id.toString(),
      ...getCookieDebugMeta(req),
      cookieOptions: {
        httpOnly: true,
        secure: isRefreshCookieSecure(),
        sameSite: 'strict',
        path: '/',
        maxAgeMs: parseDuration(config.JWT_REFRESH_EXPIRES_IN),
      },
      refreshTokenJwtLength: refreshTokenJwt.length,
      accessTokenLength: accessToken.length,
      nodeEnv: config.NODE_ENV,
      frontendUrl: config.FRONTEND_URL,
    });

    await AuditLog.create({
      userId: user._id,
      event: 'LOGIN_SUCCESS',
      ipAddress: ip,
      userAgent,
      deviceFingerprint: fingerprint,
    });

    // EVENT_SLOT: emit 'user.login' event to message queue

    return {
      accessToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt,
      },
    };
  }

  /**
   * Refresh access token using HttpOnly cookie refresh token.
   * Implements token rotation with theft detection via family tracking.
   */
  async refreshToken(req: Request, res: Response): Promise<{ accessToken: string }> {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    const fingerprint = generateFingerprint(req);
    const cookieMeta = getCookieDebugMeta(req);

    logAuthToken('refresh:request', {
      ip,
      userAgent,
      origin: req.headers.origin ?? null,
      referer: req.headers.referer ?? null,
      ...cookieMeta,
    });

    const rawRefreshToken = req.cookies?.['refreshToken'] as string | undefined;

    if (!rawRefreshToken) {
      logAuthToken('refresh:failed', { reason: 'no_refresh_token_cookie', ...cookieMeta });
      throw new UnauthorizedError('No refresh token provided.');
    }

    // Verify JWT signature
    const payload = verifyRefreshToken(rawRefreshToken);
    if (!payload) {
      logAuthToken('refresh:failed', {
        reason: 'invalid_or_expired_refresh_jwt',
        refreshTokenLength: rawRefreshToken.length,
      });
      clearRefreshCookie(res);
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    // tokenId in the JWT payload is already the hashed token (set at login time)
    const hashedToken = payload.tokenId;

    // REDIS_SLOT: check blacklist here before DB query

    // Find token in DB
    const tokenDoc = await Token.findOne({ tokenHash: hashedToken });

    if (!tokenDoc) {
      logAuthToken('refresh:failed', {
        reason: 'refresh_token_not_found_in_db',
        userId: payload.userId,
        family: payload.family,
      });
      clearRefreshCookie(res);
      throw new UnauthorizedError('Refresh token not found.');
    }

    // TOKEN THEFT DETECTION: if revoked token is used, revoke entire family
    if (tokenDoc.isRevoked) {
      logAuthToken('refresh:failed', {
        reason: 'token_theft_detected_revoked_token_reused',
        userId: payload.userId,
        family: payload.family,
      });
      logger.warn('Token theft detected — revoking entire family', {
        userId: payload.userId,
        family: payload.family,
      });

      await Token.updateMany({ family: payload.family }, { isRevoked: true });

      await AuditLog.create({
        userId: new mongoose.Types.ObjectId(payload.userId),
        event: 'TOKEN_THEFT_DETECTED',
        ipAddress: ip,
        userAgent,
        deviceFingerprint: fingerprint,
        metadata: { family: payload.family },
      });

      clearRefreshCookie(res);
      throw new UnauthorizedError('Security alert: session invalidated. Please log in again.');
    }

    // Check token expiry
    if (tokenDoc.expiresAt < new Date()) {
      logAuthToken('refresh:failed', {
        reason: 'refresh_token_expired',
        userId: payload.userId,
        expiresAt: tokenDoc.expiresAt.toISOString(),
      });
      clearRefreshCookie(res);
      throw new UnauthorizedError('Refresh token expired.');
    }

    // Verify user still exists and is active
    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) {
      logAuthToken('refresh:failed', {
        reason: 'user_not_found_or_inactive',
        userId: payload.userId,
        userFound: !!user,
        userActive: user?.isActive ?? false,
      });
      clearRefreshCookie(res);
      throw new UnauthorizedError('User not found or inactive.');
    }

    // Session poll: blocked users without active override lose the session
    if (user.role === 'user') {
      const { assertUserSessionNotExpired } = await import('../vmAccessSchedule/scheduleManager');
      const ok = await assertUserSessionNotExpired(user._id.toString());
      if (!ok) {
        clearRefreshCookie(res);
        await Token.updateMany({ userId: user._id, isRevoked: false }, { $set: { isRevoked: true } });
        throw new UnauthorizedError('Session expired: access window ended.');
      }
    }

    // Generate new tokens (rotation)
    const sessionId = generateSessionId();
    const newRawRefreshToken = generateSecureToken(32);
    const newHashedRefreshToken = hashToken(newRawRefreshToken);

    const newAccessToken = signAccessToken({
      userId: user._id.toString(),
      role: user.role,
      sessionId,
    });

    const newRefreshTokenJwt = signRefreshToken({
      userId: user._id.toString(),
      family: payload.family,
      tokenId: newHashedRefreshToken,
    });

    // Mark old token as revoked and record replacement
    tokenDoc.isRevoked = true;
    tokenDoc.replacedByToken = newHashedRefreshToken;
    await tokenDoc.save();

    // REDIS_SLOT: write to blacklist on revocation

    // Store new hashed refresh token (same family)
    const refreshExpiresAt = new Date(Date.now() + parseDuration(config.JWT_REFRESH_EXPIRES_IN));
    await Token.create({
      userId: user._id,
      tokenHash: newHashedRefreshToken,
      family: payload.family,
      deviceFingerprint: fingerprint,
      isRevoked: false,
      expiresAt: refreshExpiresAt,
      ipAddress: ip,
      userAgent,
    });

    // Update cookie
    res.cookie('refreshToken', newRefreshTokenJwt, getRefreshCookieOptions());

    logAuthToken('refresh:success', {
      userId: user._id.toString(),
      family: payload.family,
      accessTokenLength: newAccessToken.length,
      newRefreshTokenJwtLength: newRefreshTokenJwt.length,
      cookieOptions: {
        httpOnly: true,
        secure: isRefreshCookieSecure(),
        sameSite: 'strict',
        path: '/',
        maxAgeMs: parseDuration(config.JWT_REFRESH_EXPIRES_IN),
      },
    });

    await AuditLog.create({
      userId: user._id,
      event: 'TOKEN_REFRESHED',
      ipAddress: ip,
      userAgent,
      deviceFingerprint: fingerprint,
    });

    return { accessToken: newAccessToken };
  }

  /**
   * Logout: revoke refresh token and clear cookie.
   */
  async logout(req: Request, res: Response): Promise<{ message: string }> {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    const fingerprint = generateFingerprint(req);

    const rawRefreshToken = req.cookies?.['refreshToken'] as string | undefined;

    if (rawRefreshToken) {
      const payload = verifyRefreshToken(rawRefreshToken);
      if (payload) {
        // tokenId in the JWT payload is already the hashed token
        const hashedToken = payload.tokenId;
        await Token.findOneAndUpdate({ tokenHash: hashedToken }, { isRevoked: true });

        // REDIS_SLOT: write to blacklist on revocation

        await AuditLog.create({
          userId: new mongoose.Types.ObjectId(payload.userId),
          event: 'LOGOUT',
          ipAddress: ip,
          userAgent,
          deviceFingerprint: fingerprint,
        });
      }
    }

    clearRefreshCookie(res);
    return { message: 'Logged out successfully.' };
  }

  /**
   * Validate access token for gateway (Option B).
   * Called by cloud-gateway to check token validity and revocation.
   * Protected by INTERNAL_SERVICE_SECRET.
   */
  async validateTokenForGateway(accessToken: string, _req: Request): Promise<TokenValidationResult> {
    const payload = verifyAccessToken(accessToken);

    if (!payload) {
      return { valid: false, reason: 'invalid_or_expired_token' };
    }

    // Check user still exists and is active
    const user = await User.findById(payload.userId).select('isActive passwordChangedAt role');

    if (!user || !user.isActive) {
      return { valid: false, reason: 'user_not_found_or_inactive' };
    }

    // Invalidate tokens issued before password change
    if (user.passwordChangedAt && payload.iat) {
      const passwordChangedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (payload.iat < passwordChangedTimestamp) {
        return { valid: false, reason: 'token_issued_before_password_change' };
      }
    }

    return {
      valid: true,
      userId: payload.userId,
      role: payload.role as UserRole,
      sessionId: payload.sessionId,
    };
  }

  /**
   * Forgot password — sends a reset link via email.
   * Always returns the same generic message to prevent email enumeration.
   */
  async forgotPassword(email: string, req: Request): Promise<void> {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    const fingerprint = generateFingerprint(req);

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always log and return — never reveal whether email exists
    if (!user || !user.isEmailVerified || !user.isActive) {
      await AuditLog.create({
        event: 'PASSWORD_RESET_REQUESTED',
        ipAddress: ip,
        userAgent,
        deviceFingerprint: fingerprint,
        metadata: { email, reason: 'user_not_found_or_inactive' },
      });
      return; // Silent — same response as success
    }

    const rawToken = generateSecureToken(32);
    const hashedToken = hashToken(rawToken);

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 1 * 60 * 1000); // 1 minute
    await user.save();

    await sendPasswordResetEmail(user.email, rawToken);

    await AuditLog.create({
      userId: user._id,
      event: 'PASSWORD_RESET_REQUESTED',
      ipAddress: ip,
      userAgent,
      deviceFingerprint: fingerprint,
      metadata: { email },
    });
  }

  /**
   * Reset password using the token from the email link.
   * Revokes all existing sessions after successful reset.
   */
  async resetPassword(token: string, newPassword: string, req: Request): Promise<void> {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    const fingerprint = generateFingerprint(req);

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+password +passwordResetToken +passwordResetExpires');

    if (!user) {
      throw new AppError('Password reset link is invalid or has expired.', 400, 'INVALID_TOKEN');
    }

    // Set new password — pre-save hook hashes with argon2id and sets passwordChangedAt
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Revoke all active refresh tokens for this user — forces re-login everywhere
    await Token.updateMany({ userId: user._id, isRevoked: false }, { isRevoked: true });

    await AuditLog.create({
      userId: user._id,
      event: 'PASSWORD_RESET_SUCCESS',
      ipAddress: ip,
      userAgent,
      deviceFingerprint: fingerprint,
    });
  }

  /**
   * Get current authenticated user info.
   */
  async getCurrentUser(userId: string): Promise<object> {
    const user = await User.findById(userId).select(
      '-password -emailVerificationToken -emailVerificationExpires'
    );

    if (!user) {
      throw new UnauthorizedError('User not found.');
    }

    return user;
  }
}

export const authService = new AuthService();
