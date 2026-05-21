import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a cryptographically secure random token.
 * Raw token is sent to user; hashed version is stored in DB.
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * SHA-256 hash a token for safe DB storage.
 * Never store raw tokens in the database.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a UUID v4 for session IDs.
 */
export function generateSessionId(): string {
  return uuidv4();
}

/**
 * Generate a UUID v4 for token family tracking.
 */
export function generateTokenFamily(): string {
  return uuidv4();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
