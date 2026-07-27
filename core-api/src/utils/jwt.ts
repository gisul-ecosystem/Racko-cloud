import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';

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
