import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import type { AuthenticatedRequest, UserRole } from '../types';
import { rbacService } from '../modules/rbac/rbac.service';

/**
 * Require a control-plane permission.
 * `super_admin` always bypasses. `staff` must hold the permission via RBAC roles.
 * Must be used after requireAuth.
 */
export function requirePermission(...permissions: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return next(new ForbiddenError('Authentication required.'));
      }

      if (authReq.user.role === 'super_admin') {
        return next();
      }

      if (authReq.user.role !== 'staff') {
        return next(new ForbiddenError('Insufficient permissions.'));
      }

      const effective = await rbacService.getEffectivePermissions(authReq.user.userId);
      const ok = permissions.some((p) => effective.has(p));
      if (!ok) {
        return next(new ForbiddenError('Insufficient permissions.'));
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Allow if user has one of the coarse roles OR (staff with one of the permissions).
 */
export function requireRoleOrPermission(roles: UserRole[], ...permissions: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return next(new ForbiddenError('Authentication required.'));
      }

      if (authReq.user.role === 'super_admin' || roles.includes(authReq.user.role)) {
        return next();
      }

      if (authReq.user.role === 'staff' && permissions.length > 0) {
        const effective = await rbacService.getEffectivePermissions(authReq.user.userId);
        if (permissions.some((p) => effective.has(p))) {
          return next();
        }
      }

      return next(new ForbiddenError('Insufficient permissions.'));
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Allow Super Admin console entry: full super_admin or any staff account.
 */
export function requireControlPlane() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return next(new ForbiddenError('Authentication required.'));
    }
    if (authReq.user.role === 'super_admin' || authReq.user.role === 'staff') {
      return next();
    }
    return next(new ForbiddenError('Insufficient permissions.'));
  };
}
