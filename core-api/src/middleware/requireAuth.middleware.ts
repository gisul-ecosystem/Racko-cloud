import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import type { AuthenticatedRequest } from '../types';

/**
 * Middleware to require a valid access token.
 * Extracts Bearer token from Authorization header.
 * Attaches decoded payload to req.user.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authorization header missing or malformed.'));
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    return next(new UnauthorizedError('Invalid or expired access token.'));
  }

  (req as AuthenticatedRequest).user = payload;
  next();
}
