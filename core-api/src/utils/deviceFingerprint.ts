import crypto from 'crypto';
import type { Request } from 'express';

/**
 * Generate a device fingerprint from request headers.
 * Hashes: IP + User-Agent + Accept-Language + Accept-Encoding
 * Used to detect token usage from a different device/location.
 */
export function generateFingerprint(req: Request): string {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] ?? 'unknown';
  const acceptLanguage = req.headers['accept-language'] ?? 'unknown';
  const acceptEncoding = req.headers['accept-encoding'] ?? 'unknown';

  const raw = `${ip}|${userAgent}|${acceptLanguage}|${acceptEncoding}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Extract the real client IP, accounting for proxies.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  }
  return req.ip ?? 'unknown';
}
