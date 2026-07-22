import type { Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import type { GatewayRequest } from '../types';
import { config } from '../config';

// ---------------------------------------------------------------------------
// IPv4 matching
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

// ---------------------------------------------------------------------------
// IPv6 matching
// ---------------------------------------------------------------------------

/**
 * Expand a full or compressed IPv6 address into 8 groups of 16-bit numbers.
 * Returns null if the address is not valid.
 */
function expandIPv6(ip: string): number[] | null {
  // Strip any trailing scope id (e.g. %eth0)
  const bare = ip.split('%')[0] ?? ip;

  if (!bare.includes(':')) return null;

  const halves = bare.split('::');
  if (halves.length > 2) return null; // more than one :: is invalid

  const parseGroups = (s: string): number[] | null => {
    if (s === '') return [];
    const parts = s.split(':');
    const result: number[] = [];
    for (const p of parts) {
      if (p.length === 0 || p.length > 4) return null;
      const n = parseInt(p, 16);
      if (isNaN(n)) return null;
      result.push(n);
    }
    return result;
  };

  if (halves.length === 1) {
    // No :: — must be exactly 8 groups
    const groups = parseGroups(halves[0] ?? '');
    if (!groups || groups.length !== 8) return null;
    return groups;
  }

  // Has :: — expand the missing groups as zeros
  const left = parseGroups(halves[0] ?? '');
  const right = parseGroups(halves[1] ?? '');
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}

/** Return true if IPv6 `ip` falls within the IPv6 CIDR `cidr`. */
function ipv6InCidr(ip: string, cidr: string): boolean {
  const slashIdx = cidr.lastIndexOf('/');
  if (slashIdx === -1) return false;
  const network = cidr.slice(0, slashIdx);
  const prefixLen = parseInt(cidr.slice(slashIdx + 1), 10);
  if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 128) return false;

  const ipGroups = expandIPv6(ip);
  const netGroups = expandIPv6(network);
  if (!ipGroups || !netGroups) return false;

  // Compare bit by bit up to prefixLen
  let bitsLeft = prefixLen;
  for (let i = 0; i < 8 && bitsLeft > 0; i++) {
    const bits = Math.min(bitsLeft, 16);
    const shift = 16 - bits;
    const mask = (0xffff << shift) & 0xffff;
    if (((ipGroups[i]!) & mask) !== ((netGroups[i]!) & mask)) return false;
    bitsLeft -= bits;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a raw client IP:
 * - Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4 → 1.2.3.4)
 * - Strip port from IPv4:port (only one colon present)
 * - Strip scope id from IPv6 (%eth0)
 */
function normaliseIp(raw: string): string {
  // IPv6-mapped IPv4
  if (raw.toLowerCase().startsWith('::ffff:')) {
    return raw.slice(7);
  }
  // Strip port from IPv4:port — exactly one colon
  const colonCount = (raw.match(/:/g) ?? []).length;
  if (colonCount === 1) {
    return raw.split(':')[0] ?? raw;
  }
  // Strip scope id
  return raw.split('%')[0] ?? raw;
}

/** Return true if the address looks like IPv6 (contains colons). */
function isIPv6(ip: string): boolean {
  return ip.includes(':');
}

// ---------------------------------------------------------------------------
// Allowlist check
// ---------------------------------------------------------------------------

/**
 * Return true when clientIp is permitted by the allowlist.
 * Each entry may be an exact IP or a CIDR range (IPv4 or IPv6).
 */
function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  const ip = normaliseIp(clientIp);
  const ipIsV6 = isIPv6(ip);

  for (const entry of allowedIps) {
    const e = entry.trim();
    if (!e) continue;

    const isCidr = e.includes('/');
    const entryIsV6 = isIPv6(e.replace(/\/\d+$/, '')); // strip prefix before checking

    if (isCidr) {
      if (!entryIsV6 && !ipIsV6) {
        if (ipv4InCidr(ip, e)) return true;
      } else if (entryIsV6 && ipIsV6) {
        if (ipv6InCidr(ip, e)) return true;
      }
      // mismatched families — skip
    } else {
      // Exact match — case-insensitive (IPv6 can be upper or lower)
      if (ip.toLowerCase() === normaliseIp(e).toLowerCase()) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Client IP resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * ipAccessGuard middleware
 *
 * Runs after `tenantResolver`. If the resolved tenant has `ipAccessMode`
 * set to `'restricted'`, only IPs in `allowedIps` are let through.
 * Supports IPv4, IPv4 CIDR, IPv6, and IPv6 CIDR entries.
 * All other requests (no tenant context, or mode = 'all') pass unchanged.
 *
 * Never blocks in development mode — makes local testing frictionless.
 */
export function ipAccessGuard(
  req: GatewayRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.tenantContext) return next();

  const { ipAccessMode, allowedIps } = req.tenantContext;

  if (ipAccessMode !== 'restricted') return next();

  if (config.NODE_ENV === 'development') return next();

  const clientIp = resolveClientIp(req);

  if (!clientIp) {
    logger.warn('[ipAccessGuard] Could not determine client IP — denying', {
      tenantId: req.tenantContext.id,
      requestId: req.requestId,
      path: req.path,
    });
    res.status(403).json({ success: false, message: 'Access denied.', code: 'IP_ACCESS_DENIED' });
    return;
  }

  if (allowedIps.length === 0) {
    logger.warn('[ipAccessGuard] Restricted mode with empty allowedIps — blocking all', {
      tenantId: req.tenantContext.id,
      clientIp,
      path: req.path,
    });
    res.status(403).json({ success: false, message: 'Access denied.', code: 'IP_ACCESS_DENIED' });
    return;
  }

  if (!isIpAllowed(clientIp, allowedIps)) {
    logger.info('[ipAccessGuard] Blocked request from unlisted IP', {
      tenantId: req.tenantContext.id,
      clientIp,
      path: req.path,
      requestId: req.requestId,
    });
    res.status(403).json({ success: false, message: 'Access denied.', code: 'IP_ACCESS_DENIED' });
    return;
  }

  next();
}

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
