import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';

/** Developer API access token (OAuth2 client_credentials) — not a user session JWT. */
export const RACKO_PUBLIC_API_AUDIENCE = 'racko-public-api';
export const API_ACCESS_TOKEN_TYP = 'api_access';
export const API_ACCESS_TOKEN_EXPIRES_SEC = 3600;

export interface ApiAccessTokenPayload {
  sub: string;
  /** ApiCredential document id — binds token to a single credential row. */
  cid?: string;
  ownerType: 'tenant' | 'platform';
  tenantId?: string;
  adminId?: string;
  scope: string;
  jti: string;
  typ: typeof API_ACCESS_TOKEN_TYP;
  /** Set by jwt.sign via the `audience` option — not included in the sign payload. */
  aud?: typeof RACKO_PUBLIC_API_AUDIENCE | string | string[];
  iat?: number;
  exp?: number;
}

export function signApiAccessToken(input: {
  clientId: string;
  credentialId: string;
  ownerType: 'tenant' | 'platform';
  tenantId?: string | null;
  adminId?: string | null;
  scopes: string[];
}): string {
  const scope = input.scopes.join(' ');
  const payload: Omit<ApiAccessTokenPayload, 'iat' | 'exp' | 'aud'> = {
    sub: input.clientId,
    cid: input.credentialId,
    ownerType: input.ownerType,
    scope,
    jti: crypto.randomBytes(16).toString('hex'),
    typ: API_ACCESS_TOKEN_TYP,
  };
  if (input.ownerType === 'tenant' && input.tenantId) {
    payload.tenantId = input.tenantId;
  }
  if (input.ownerType === 'platform' && input.adminId) {
    payload.adminId = input.adminId;
  }

  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: API_ACCESS_TOKEN_EXPIRES_SEC,
    algorithm: 'HS256',
    audience: RACKO_PUBLIC_API_AUDIENCE,
  });
}

/**
 * Verify a developer API access token. Rejects user/tenant session JWTs (wrong aud/typ).
 */
export function verifyApiAccessToken(token: string): ApiAccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      audience: RACKO_PUBLIC_API_AUDIENCE,
    }) as ApiAccessTokenPayload & { userId?: string; type?: string };

    if (decoded.typ !== API_ACCESS_TOKEN_TYP) {
      return null;
    }
    const aud = decoded.aud;
    const audOk =
      aud === RACKO_PUBLIC_API_AUDIENCE ||
      (Array.isArray(aud) && aud.includes(RACKO_PUBLIC_API_AUDIENCE));
    if (!audOk) {
      return null;
    }
    if (decoded.userId || decoded.type === 'tenant') {
      return null;
    }
    if (!decoded.sub || !decoded.ownerType || typeof decoded.scope !== 'string') {
      return null;
    }
    if (decoded.ownerType === 'tenant' && !decoded.tenantId) {
      return null;
    }
    if (decoded.ownerType === 'platform' && !decoded.adminId) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Sign an access token.
 * Payload: { userId, role, sessionId }
 * Expiry: 15 minutes
 * Never include sensitive data in JWT payload.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/**
 * Sign a refresh token.
 * Payload: { userId, family, tokenId }
 * Expiry: 7 days
 */
export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/**
 * Verify an access token. Returns null if invalid or expired.
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    });
    return decoded as AccessTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Verify a refresh token. Returns null if invalid or expired.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    });
    return decoded as RefreshTokenPayload;
  } catch {
    return null;
  }
}
