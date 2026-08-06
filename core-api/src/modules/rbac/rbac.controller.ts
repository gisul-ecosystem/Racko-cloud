import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { rbacService } from './rbac.service';
import type {
  CreateRbacRoleInput,
  UpdateRbacRoleInput,
  SetUserRolesInput,
  CreateStaffUserInput,
} from './rbac.validation';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

async function getCatalog(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, 'Permission catalog retrieved.', {
      permissions: rbacService.listPermissionCatalog(),
    });
  } catch (err) {
    next(err);
  }
}

async function getMyPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const keys = await rbacService.getEffectivePermissions(authReq.user.userId);
    const roleSlugs = await rbacService.getAssignedRoleSlugs(authReq.user.userId);
    success(res, 'Effective permissions retrieved.', {
      role: authReq.user.role,
      permissions: [...keys].sort(),
      roleSlugs,
      isSuperAdmin: authReq.user.role === 'super_admin',
    });
  } catch (err) {
    next(err);
  }
}

async function listRoles(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await rbacService.listRoles();
    success(res, 'RBAC roles retrieved.', { roles, total: roles.length });
  } catch (err) {
    next(err);
  }
}

async function createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateRbacRoleInput;
    const role = await rbacService.createRole(body, authReq.user.userId);
    success(res, 'Role created.', { role }, 201);
  } catch (err) {
    next(err);
  }
}

async function updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = req.params['id'] as string;
    const body = req.body as UpdateRbacRoleInput;
    const role = await rbacService.updateRole(id, body, authReq.user.userId);
    success(res, 'Role updated.', { role });
  } catch (err) {
    next(err);
  }
}

async function listPeople(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const people = await rbacService.listStaffPeople();
    success(res, 'Control-plane people retrieved.', { people, total: people.length });
  } catch (err) {
    next(err);
  }
}

async function setUserRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = req.params['userId'] as string;
    const body = req.body as SetUserRolesInput;
    const person = await rbacService.setUserRoles(userId, body.roleIds, authReq.user.userId);
    success(res, 'Role assignments updated.', { person });
  } catch (err) {
    next(err);
  }
}

async function createStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateStaffUserInput;
    const person = await rbacService.createStaffUser(body, authReq.user.userId);
    success(res, 'Staff user created.', { person }, 201);
  } catch (err) {
    next(err);
  }
}

async function deleteStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = req.params['userId'] as string;
    const result = await rbacService.deleteStaffUser(userId, authReq.user.userId);
    success(res, 'Staff user deleted.', result);
  } catch (err) {
    next(err);
  }
}

async function listAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Number(req.query['limit'] || 50);
    const entries = await rbacService.listAudit(limit);
    success(res, 'RBAC audit retrieved.', { entries, total: entries.length });
  } catch (err) {
    next(err);
  }
}

export const rbacController = {
  getCatalog,
  getMyPermissions,
  listRoles,
  createRole,
  updateRole,
  listPeople,
  setUserRoles,
  createStaff,
  deleteStaff,
  listAudit,
};
