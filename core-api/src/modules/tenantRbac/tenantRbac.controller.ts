import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../utils/errors';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { tenantRbacService } from './tenantRbac.service';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

function getTenantCtx(req: Request): {
  tenantId: string;
  subjectId: string;
  isTenantAdmin: boolean;
  role: string;
} {
  const authReq = req as TenantAuthenticatedRequest;
  const tenantUser = authReq.tenantUser;
  if (!tenantUser?.tenantId || !tenantUser.id || !tenantUser.role) {
    throw new ForbiddenError('Tenant authentication required.');
  }
  return {
    tenantId: tenantUser.tenantId,
    subjectId: tenantUser.id,
    isTenantAdmin: tenantUser.role === 'tenant_admin',
    role: tenantUser.role,
  };
}

export class TenantRbacController {
  getMyPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getTenantCtx(req);
      const permissions = await tenantRbacService.getEffectivePermissions(ctx);
      success(res, 'Tenant permissions retrieved.', {
        role: ctx.role,
        tenantId: ctx.tenantId,
        isTenantAdmin: ctx.isTenantAdmin,
        permissions: [...permissions],
      });
    } catch (err) {
      next(err);
    }
  };

  getCatalog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      getTenantCtx(req);
      success(res, 'Permission catalog retrieved.', {
        permissions: tenantRbacService.listPermissionCatalog(),
      });
    } catch (err) {
      next(err);
    }
  };

  listRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getTenantCtx(req);
      const roles = await tenantRbacService.listRoles(ctx.tenantId);
      success(res, 'Roles retrieved.', { roles, total: roles.length });
    } catch (err) {
      next(err);
    }
  };

  createRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getTenantCtx(req);
      if (!ctx.isTenantAdmin) {
        const perms = await tenantRbacService.getEffectivePermissions(ctx);
        if (!perms.has('rbac.roles.write')) {
          throw new ForbiddenError('Insufficient permissions.');
        }
      }
      const role = await tenantRbacService.createRole(
        ctx.tenantId,
        req.body as { name: string; description?: string; permissions: string[] },
        ctx.subjectId
      );
      success(res, 'Role created.', { role }, 201);
    } catch (err) {
      next(err);
    }
  };

  updateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getTenantCtx(req);
      if (!ctx.isTenantAdmin) {
        const perms = await tenantRbacService.getEffectivePermissions(ctx);
        if (!perms.has('rbac.roles.write')) {
          throw new ForbiddenError('Insufficient permissions.');
        }
      }
      const role = await tenantRbacService.updateRole(
        ctx.tenantId,
        req.params.id as string,
        req.body as {
          name?: string;
          description?: string;
          permissions?: string[];
          isActive?: boolean;
        }
      );
      success(res, 'Role updated.', { role });
    } catch (err) {
      next(err);
    }
  };

  listPeople = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getTenantCtx(req);
      const people = await tenantRbacService.listPeople(ctx.tenantId);
      success(res, 'People retrieved.', { people, total: people.length });
    } catch (err) {
      next(err);
    }
  };

  setUserRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getTenantCtx(req);
      if (!ctx.isTenantAdmin) {
        const perms = await tenantRbacService.getEffectivePermissions(ctx);
        if (!perms.has('rbac.assign')) {
          throw new ForbiddenError('Insufficient permissions.');
        }
      }
      const roleIds = await tenantRbacService.setUserRoles(
        ctx.tenantId,
        req.params.userId as string,
        (req.body as { roleIds: string[] }).roleIds || [],
        ctx.subjectId
      );
      success(res, 'Roles assigned.', { roleIds });
    } catch (err) {
      next(err);
    }
  };
}

export const tenantRbacController = new TenantRbacController();
