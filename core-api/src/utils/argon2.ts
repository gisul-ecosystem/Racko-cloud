import argon2 from 'argon2';
import { config } from '../config';

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: config.ARGON2_MEMORY_COST, // 64MB — OWASP recommended minimum
  timeCost: config.ARGON2_TIME_COST,     // 3 iterations
  parallelism: config.ARGON2_PARALLELISM, // 4 threads
  raw: false,
};

/**
 * Hash a plaintext password using Argon2id.
 * OWASP recommended: memoryCost=65536, timeCost=3, parallelism=4
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against an Argon2id hash.
 * Always call this even if user is not found (timing attack prevention).
 */
export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

/**
 * Dummy hash used for timing attack prevention when user is not found.
 * Running argon2 verify on this prevents timing-based email enumeration.
 */
export const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$dGhpcyBpcyBhIGR1bW15IHNhbHQ$dGhpcyBpcyBhIGR1bW15IGhhc2g';
