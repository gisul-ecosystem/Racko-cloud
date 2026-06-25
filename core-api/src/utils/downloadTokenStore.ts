import crypto from 'crypto';

interface DownloadTokenEntry {
  machineId: string;
  adminId: string;
  os: string;
  expiresAt: number; // ms timestamp
}

// In-memory store — single-use, 60-second TTL
// For multi-instance deployments, replace with Redis.
const store = new Map<string, DownloadTokenEntry>();

const TTL_MS = 60 * 1000; // 60 seconds

/**
 * Generate a single-use signed download token tied to a machine + admin.
 * Returns the opaque token string.
 */
export function createDownloadToken(machineId: string, adminId: string, os: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  store.set(token, {
    machineId,
    adminId,
    os,
    expiresAt: Date.now() + TTL_MS,
  });

  // Auto-clean after TTL so memory doesn't leak
  setTimeout(() => store.delete(token), TTL_MS + 1000);

  return token;
}

/**
 * Consume a download token — validates it, checks expiry, deletes it (single-use).
 * Returns the entry on success, null on invalid/expired.
 */
export function consumeDownloadToken(token: string): DownloadTokenEntry | null {
  const entry = store.get(token);
  if (!entry) return null;

  store.delete(token); // single-use — invalidate immediately

  if (Date.now() > entry.expiresAt) return null;

  return entry;
}
