import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

const RATE_LIMITED_RESPONSE = {
  success: false,
  message: 'Too many auth requests. Please try again later.',
  code: 'RATE_LIMITED',
} as const;

const LOGIN_FAILED_RESPONSE = {
  success: false,
  message: 'Too many failed login attempts from this network. Please try again later.',
  code: 'RATE_LIMITED',
} as const;

function createRateLimitHandler(label: string) {
  return (req: Request, res: Response, _next: NextFunction, options: { statusCode: number; message: unknown }) => {
    logger.warn(`${label} rate limit exceeded`, { ip: req.ip, path: req.path });
    res.status(options.statusCode).json(options.message);
  };
}

/**
 * Login rate limiter — IP-based, counts failed attempts only (4xx from core-api).
 * Successful logins (2xx) do not consume the bucket — safe for shared NAT / campus networks.
 */
export const loginFailedRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_LOGIN_FAILED_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: LOGIN_FAILED_RESPONSE,
  handler: createRateLimitHandler('Login failed'),
});

/**
 * Register rate limiter — IP-based, counts failed attempts only (4xx from core-api).
 * Successful registrations (2xx) do not consume the bucket.
 */
export const registerRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_REGISTER_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMITED_RESPONSE,
  handler: createRateLimitHandler('Register'),
});

/**
 * Verify-email rate limiter — IP-based, counts failed attempts only (4xx from core-api).
 * Successful verifications (2xx) do not consume the bucket.
 */
export const verifyEmailRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_VERIFY_EMAIL_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMITED_RESPONSE,
  handler: createRateLimitHandler('Verify email'),
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
          const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
            userId?: string;
            sub?: string;
            type?: string;
          };
          const rateLimitUserId =
            decoded.userId || (decoded.type === 'tenant' && decoded.sub ? decoded.sub : undefined);
          if (rateLimitUserId) {
            logger.debug('Rate limit key: user', { userId: rateLimitUserId, path: req.path });
            return `user:${rateLimitUserId}`;
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
  handler: createRateLimitHandler('User'),
});
