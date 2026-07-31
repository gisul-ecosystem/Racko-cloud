import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import type { AuthenticatedRequest } from '../types';
import type { TenantAuthenticatedRequest } from './requireTenantAuth.middleware';
import { User } from '../models/user.model';
import {
  platformRbacService,
  resolvePlatformOrgOwnerId,
} from '../modules/platformRbac/platformRbac.service';
import { tenantRbacService } from '../modules/tenantRbac/tenantRbac.service';

/**
 * Require a platform-org permission.
 * Org owners bypass. Org operators need the permission via assigned roles.
 */
export function requirePlatformPermission(...permissions: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) return next(new ForbiddenError('Authentication required.'));
      if (authReq.user.role === 'super_admin') return next();
      if (authReq.user.role !== 'admin') {
        return next(new ForbiddenError('Insufficient permissions.'));
      }

      const user = await User.findById(authReq.user.userId)
        .select('role orgOwnerId isActive')
        .lean();
      if (!user || !user.isActive) {
        return next(new ForbiddenError('Account is inactive.'));
      }

      const orgId = resolvePlatformOrgOwnerId({
        _id: user._id,
        role: user.role,
        orgOwnerId: user.orgOwnerId,
      });
      if (!orgId) return next(new ForbiddenError('Organization context required.'));

      const isOrgOwner = !user.orgOwnerId;
      const effective = await platformRbacService.getEffectivePermissions({
        subjectId: authReq.user.userId,
        orgId,
        isOrgOwner,
      });

      if (permissions.some((p) => effective.has(p))) return next();
      return next(new ForbiddenError('Insufficient permissions.'));
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Require a tenant permission.
 * tenant_admin bypasses. tenant_user needs assigned permissions.
 */
export function requireTenantPermission(...permissions: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantUser = authReq.tenantUser;
      if (!tenantUser?.tenantId || !tenantUser.id || !tenantUser.role) {
        return next(new ForbiddenError('Tenant authentication required.'));
      }

      const effective = await tenantRbacService.getEffectivePermissions({
        tenantId: tenantUser.tenantId,
        subjectId: tenantUser.id,
        isTenantAdmin: tenantUser.role === 'tenant_admin',
      });

      if (permissions.some((p) => effective.has(p))) return next();
      return next(new ForbiddenError('Insufficient permissions.'));
    } catch (err) {
      next(err);
    }
  };
}
