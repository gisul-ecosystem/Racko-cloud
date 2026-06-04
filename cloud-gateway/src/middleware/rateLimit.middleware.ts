import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Auth routes rate limiter — IP-based, protects login/register from brute force.
 */
export const authRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth requests. Please try again later.', code: 'RATE_LIMITED' },
  handler: (req, res, _next, options) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Authenticated routes rate limiter — user ID-based.
 * Each user gets their own independent bucket regardless of shared IP.
 * Falls back to IP if user ID cannot be extracted.
 */
export const userRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_USER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    try {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = token.split('.')[1];
        if (payload) {
          const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { userId?: string };
          if (decoded.userId) {
            logger.debug('Rate limit key: user', { userId: decoded.userId, path: req.path });
            return `user:${decoded.userId}`;
          }
          logger.warn('Rate limit: JWT decoded but no userId found', { path: req.path, keys: Object.keys(decoded) });
        }
      }
    } catch (err) {
      logger.warn('Rate limit: JWT decode failed, falling back to IP', { path: req.path, error: err instanceof Error ? err.message : String(err) });
    }
    logger.debug('Rate limit key: ip', { ip: req.ip, path: req.path });
    return `ip:${req.ip ?? 'unknown'}`;
  },
  message: { success: false, message: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
  handler: (req, res, _next, options) => {
    logger.warn('User rate limit exceeded', { ip: req.ip, path: req.path, method: req.method });
    res.status(options.statusCode).json(options.message);
  },
});
