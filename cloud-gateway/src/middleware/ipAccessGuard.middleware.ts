import type { Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import type { GatewayRequest } from '../types';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Lightweight IPv4 / CIDR matching — no external dependencies required.
// ---------------------------------------------------------------------------

/** Convert a dotted-quad IPv4 string to a 32-bit unsigned integer. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  // Convert to unsigned 32-bit integer
  return result >>> 0;
}

/** Return true if `ip` falls within the IPv4 CIDR block `cidr`. */
function ipv4InCidr(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  if (!network || !prefixStr) return false;

  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const networkInt = ipv4ToInt(network);
  if (ipInt === null || networkInt === null) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) >>> 0 === (networkInt & mask) >>> 0;
}

/**
 * Normalise a raw client IP that may carry a port suffix (e.g. "1.2.3.4:1234"
 * from some proxies) or an IPv6-mapped IPv4 address (::ffff:1.2.3.4).
 */
function normaliseIp(raw: string): string {
  // Strip IPv6-mapped IPv4 prefix
  if (raw.startsWith('::ffff:')) {
    return raw.slice(7);
  }
  // Strip port from IPv4:port — only when there's exactly one colon
  const colonCount = (raw.match(/:/g) ?? []).length;
  if (colonCount === 1) {
    return raw.split(':')[0] ?? raw;
  }
  return raw;
}

/**
 * Return true when the client IP is allowed by the given allowlist.
 * Each entry in `allowedIps` may be an exact IP or a CIDR range.
 */
function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  const ip = normaliseIp(clientIp);

  for (const entry of allowedIps) {
    const normalised = entry.trim();
    if (!normalised) continue;

    if (normalised.includes('/')) {
      // CIDR notation
      if (ipv4InCidr(ip, normalised)) return true;
    } else {
      // Exact match (case-insensitive for IPv6)
      if (ip.toLowerCase() === normalised.toLowerCase()) return true;
    }
  }
  return false;
}

/**
 * Resolve the real client IP from the request.
 *
 * In this deployment the gateway sits behind Nginx inside Docker, so
 * `req.ip` is always the Docker bridge IP (172.18.0.1), not the real
 * client. Nginx sets X-Forwarded-For to the actual client IP, so we
 * always prefer that header. The first entry in X-Forwarded-For is the
 * original client — subsequent entries are intermediate proxies added
 * by each hop, so we take index [0] only.
 *
 * Fall back to req.socket.remoteAddress (which equals req.ip) only when
 * the header is absent entirely (e.g. direct connections in testing).
 */
function resolveClientIp(req: GatewayRequest): string | null {
  // Always prefer X-Forwarded-For — set by Nginx with the real client IP
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = (Array.isArray(xff) ? xff[0] : xff).split(',')[0]?.trim();
    if (first) return first;
  }

  // Fallback: direct connection (no proxy in front)
  if (req.ip) return req.ip;

  return null;
}

/**
 * ipAccessGuard middleware
 *
 * Runs after `tenantResolver`. If the resolved tenant has `ipAccessMode`
 * set to `'restricted'`, only IPs in `allowedIps` are let through.
 * All other requests (no tenant context, or mode = 'all') pass unchanged.
 *
 * Never blocks in development mode — makes local testing frictionless.
 */
export function ipAccessGuard(
  req: GatewayRequest,
  res: Response,
  next: NextFunction
): void {
  // Skip when there is no tenant context (main platform domain)
  if (!req.tenantContext) {
    return next();
  }

  const { ipAccessMode, allowedIps } = req.tenantContext;

  // Mode 'all' → public access, nothing to enforce
  if (ipAccessMode !== 'restricted') {
    return next();
  }

  // Skip enforcement in development for easy local testing
  if (config.NODE_ENV === 'development') {
    return next();
  }

  const clientIp = resolveClientIp(req);

  if (!clientIp) {
    // Cannot determine client IP — fail safe: deny
    logger.warn('[ipAccessGuard] Could not determine client IP — denying', {
      tenantId: req.tenantContext.id,
      requestId: req.requestId,
      path: req.path,
    });
    res.status(403).json({
      success: false,
      message: 'Access denied.',
      code: 'IP_ACCESS_DENIED',
    });
    return;
  }

  if (allowedIps.length === 0) {
    // Restricted mode with an empty allowlist blocks everyone — intentional but
    // we log a warning so operators can spot misconfiguration quickly.
    logger.warn('[ipAccessGuard] Tenant is in restricted mode with empty allowedIps — blocking all', {
      tenantId: req.tenantContext.id,
      clientIp,
      path: req.path,
    });
    res.status(403).json({
      success: false,
      message: 'Access denied.',
      code: 'IP_ACCESS_DENIED',
    });
    return;
  }

  if (!isIpAllowed(clientIp, allowedIps)) {
    logger.info('[ipAccessGuard] Blocked request from unlisted IP', {
      tenantId: req.tenantContext.id,
      clientIp,
      path: req.path,
      requestId: req.requestId,
    });
    res.status(403).json({
      success: false,
      message: 'Access denied.',
      code: 'IP_ACCESS_DENIED',
    });
    return;
  }

  next();
}
