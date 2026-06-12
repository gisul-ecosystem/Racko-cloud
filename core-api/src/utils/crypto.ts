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
 * Generate a 12-character URL-safe password.
 * 9 random bytes encode to exactly 12 base64url characters (no padding).
 */
export function generatePassword(): string {
  return crypto.randomBytes(9).toString('base64url');
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

// ─── Reversible secret encryption (AES-256-CBC) ───────────────────────────────
//
// Used for credentials that must be retrieved in plaintext later (e.g. external
// VM console passwords). This is NOT for user passwords — those are hashed with
// Argon2id and never decrypted.
//
// Format: "<ivHex>:<cipherHex>". A fresh random IV is generated per call so the
// same plaintext never produces the same ciphertext.

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_IV_BYTES = 16;
const ENCRYPTION_KEY_SALT = 'racko-external-vm-cred-v1';

let cachedEncryptionKey: Buffer | null = null;

/**
 * Derive a stable 32-byte AES key from a configured secret. Prefers a dedicated
 * EXTERNAL_VM_ENCRYPTION_KEY, falling back to INTERNAL_SERVICE_SECRET so the
 * platform works without extra env wiring. Cached after first derivation.
 */
function getEncryptionKey(): Buffer {
  if (cachedEncryptionKey) return cachedEncryptionKey;

  const secret =
    process.env['EXTERNAL_VM_ENCRYPTION_KEY'] || process.env['INTERNAL_SERVICE_SECRET'];

  if (!secret) {
    throw new Error(
      'No encryption secret configured. Set EXTERNAL_VM_ENCRYPTION_KEY or INTERNAL_SERVICE_SECRET.'
    );
  }

  cachedEncryptionKey = crypto.scryptSync(secret, ENCRYPTION_KEY_SALT, 32);
  return cachedEncryptionKey;
}

/**
 * Encrypt a UTF-8 string with AES-256-CBC. Returns "<ivHex>:<cipherHex>".
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(ENCRYPTION_IV_BYTES);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a value produced by encrypt(). Throws if the format is invalid or the
 * key/ciphertext do not match.
 */
export function decrypt(ciphertext: string): string {
  const [ivHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !dataHex) {
    throw new Error('Invalid encrypted value format.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
