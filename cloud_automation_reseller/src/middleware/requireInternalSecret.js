import crypto from 'crypto';

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Requires X-Internal-Secret matching INTERNAL_SERVICE_SECRET (shared with core-api).
 */
export function requireInternalSecret(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_SERVICE_SECRET || '';

  if (!expected || typeof secret !== 'string' || !safeCompare(secret, expected)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  next();
}
