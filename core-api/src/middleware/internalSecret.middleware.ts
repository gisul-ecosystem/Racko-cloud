import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { safeCompare } from '../utils/crypto';

/**
 * Middleware to protect internal-only endpoints.
 * Requires X-Internal-Secret header matching INTERNAL_SERVICE_SECRET.
 * Used for gateway → core-api internal calls only.
 */
export function requireInternalSecret(req: Request, _res: Response, next: NextFunction): void {
  const secret = req.headers['x-internal-secret'];

  if (typeof secret !== 'string' || !safeCompare(secret, config.INTERNAL_SERVICE_SECRET)) {
    return next(new ForbiddenError('Access denied.'));
  }

  next();
}
