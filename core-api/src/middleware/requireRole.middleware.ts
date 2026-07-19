import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import type { AuthenticatedRequest, UserRole } from '../types';

/**
 * Middleware to require a specific role.
 * Must be used after requireAuth.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      return next(new ForbiddenError('Authentication required.'));
    }

    if (!roles.includes(authReq.user.role)) {
      return next(new ForbiddenError('Insufficient permissions.'));
    }

    next();
  };
}
