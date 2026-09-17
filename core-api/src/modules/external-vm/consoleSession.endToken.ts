import crypto from 'crypto';

/**
 * In-memory store for short-lived session end tokens.
 *
 * When a console session starts, we issue a single-use end token valid for
 * 10 minutes. The frontend stores it alongside the sessionId and sends it
 * via navigator.sendBeacon on disconnect — no auth header needed, the token
 * IS the auth. Same pattern as downloadTokenStore / job stream tickets.
 */

interface EndTokenEntry {
  sessionId: string;
  expiresAt: number; // Date.now() ms
}

const store = new Map<string, EndTokenEntry>();

/** Issue a single-use end token for a session. Valid for 10 minutes. */
export function issueEndToken(sessionId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  store.set(token, {
    sessionId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return token;
}

/**
 * Consume the token — validates and removes it in one operation (single-use).
 * Returns the sessionId if valid, null if expired or not found.
 */
export function consumeEndToken(token: string): string | null {
  const entry = store.get(token);
  if (!entry) return null;
  store.delete(token); // single-use
  if (Date.now() > entry.expiresAt) return null;
  return entry.sessionId;
}

// Sweep expired tokens every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (now > entry.expiresAt) store.delete(token);
  }
}, 5 * 60 * 1000);
