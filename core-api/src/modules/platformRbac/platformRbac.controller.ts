import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../utils/errors';
import type { AuthenticatedRequest } from '../../types';
import { User } from '../../models/user.model';
import { platformRbacService, resolvePlatformOrgOwnerId } from './platformRbac.service';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

async function resolveActorOrg(req: AuthenticatedRequest): Promise<{
  orgId: string;
  subjectId: string;
  isOrgOwner: boolean;
}> {
  if (!req.user) throw new ForbiddenError('Authentication required.');
  if (req.user.role !== 'admin') {
    throw new ForbiddenError('Only platform admins can manage organization access control.');
  }

  const user = await User.findById(req.user.userId).select('role orgOwnerId isActive').lean();
  if (!user || !user.isActive) throw new ForbiddenError('Account is inactive.');

  const orgId = resolvePlatformOrgOwnerId({
    _id: user._id,
    role: user.role,
    orgOwnerId: user.orgOwnerId,
  });
  if (!orgId) throw new ForbiddenError('Organization context required.');

  const isOrgOwner = !user.orgOwnerId;
  return { orgId, subjectId: req.user.userId, isOrgOwner };
}

export class PlatformRbacController {
  getMyPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const ctx = await resolveActorOrg(authReq);
      const permissions = await platformRbacService.getEffectivePermissions(ctx);
      success(res, 'Platform permissions retrieved.', {
        role: authReq.user!.role,
        orgId: ctx.orgId,
        isOrgOwner: ctx.isOrgOwner,
        permissions: [...permissions],
      });
    } catch (err) {
      next(err);
    }
  };

  getCatalog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await resolveActorOrg(req as AuthenticatedRequest);
      success(res, 'Permission catalog retrieved.', {
        permissions: platformRbacService.listPermissionCatalog(),
      });
    } catch (err) {
      next(err);
    }
  };

  listRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveActorOrg(req as AuthenticatedRequest);
      const roles = await platformRbacService.listRoles(ctx.orgId);
      success(res, 'Roles retrieved.', { roles, total: roles.length });
    } catch (err) {
      next(err);
    }
  };

  createRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveActorOrg(req as AuthenticatedRequest);
      if (!ctx.isOrgOwner) {
        const perms = await platformRbacService.getEffectivePermissions(ctx);
        if (!perms.has('rbac.roles.write')) {
          throw new ForbiddenError('Insufficient permissions.');
        }
      }
      const role = await platformRbacService.createRole(
        ctx.orgId,
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
      const ctx = await resolveActorOrg(req as AuthenticatedRequest);
      if (!ctx.isOrgOwner) {
        const perms = await platformRbacService.getEffectivePermissions(ctx);
        if (!perms.has('rbac.roles.write')) {
          throw new ForbiddenError('Insufficient permissions.');
        }
      }
      const role = await platformRbacService.updateRole(
        ctx.orgId,
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
      const ctx = await resolveActorOrg(req as AuthenticatedRequest);
      const people = await platformRbacService.listPeople(ctx.orgId);
      success(res, 'People retrieved.', { people, total: people.length });
    } catch (err) {
      next(err);
    }
  };

  setUserRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveActorOrg(req as AuthenticatedRequest);
      if (!ctx.isOrgOwner) {
        const perms = await platformRbacService.getEffectivePermissions(ctx);
        if (!perms.has('rbac.assign')) {
          throw new ForbiddenError('Insufficient permissions.');
        }
      }
      const roleIds = await platformRbacService.setUserRoles(
        ctx.orgId,
        req.params.userId as string,
        (req.body as { roleIds: string[] }).roleIds || [],
        ctx.subjectId
      );
      success(res, 'Roles assigned.', { roleIds });
    } catch (err) {
      next(err);
    }
  };

  inviteOperator = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveActorOrg(req as AuthenticatedRequest);
      if (!ctx.isOrgOwner) {
        throw new ForbiddenError('Only the organization owner can invite operators.');
      }
      const user = await platformRbacService.inviteOperator(
        ctx.orgId,
        req.body as { email: string; temporaryPassword: string; roleIds: string[] },
        ctx.subjectId
      );
      success(res, 'Operator invited.', { user }, 201);
    } catch (err) {
      next(err);
    }
  };
}

export const platformRbacController = new PlatformRbacController();
