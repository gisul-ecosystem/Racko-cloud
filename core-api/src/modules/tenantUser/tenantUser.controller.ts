import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { tenantUserService } from './tenantUser.service';
import type {
  CreateBulkTenantUsersDto,
  CreateSingleTenantUserDto,
} from './tenantUser.types';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class TenantUserController {
  async createSingle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const createdBy = new mongoose.Types.ObjectId(authReq.tenantUser.id);
      const dto = req.body as CreateSingleTenantUserDto;

      const user = await tenantUserService.createSingle(dto, tenantId, createdBy);
      success(res, 'Tenant user created successfully.', { user }, 201);
    } catch (error) {
      next(error);
    }
  }

  async createBulk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const createdBy = new mongoose.Types.ObjectId(authReq.tenantUser.id);
      const dto = req.body as CreateBulkTenantUsersDto;

      const result = await tenantUserService.createBulk(dto, tenantId, createdBy);
      success(
        res,
        `Bulk tenant user creation complete. ${result.created} created, ${result.failed} failed.`,
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  async listMyUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const actor = {
        id: new mongoose.Types.ObjectId(authReq.tenantUser.id),
        role: authReq.tenantUser.role,
      };
      const users = await tenantUserService.listMyUsers(tenantId, actor);
      success(res, 'Tenant users retrieved.', { users, total: users.length });
    } catch (error) {
      next(error);
    }
  }

  async setUserActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const actor = {
        id: new mongoose.Types.ObjectId(authReq.tenantUser.id),
        role: authReq.tenantUser.role,
      };
      const { userId } = req.params as { userId: string };
      const { isActive } = req.body as { isActive: boolean };

      const user = await tenantUserService.setUserActive(userId, isActive, tenantId, actor);
      success(res, `Tenant user ${isActive ? 'activated' : 'deactivated'}.`, { user });
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const actor = {
        id: new mongoose.Types.ObjectId(authReq.tenantUser.id),
        role: authReq.tenantUser.role,
      };
      const { userId } = req.params as { userId: string };

      await tenantUserService.deleteUser(userId, tenantId, actor);
      success(res, 'Tenant user deleted.');
    } catch (error) {
      next(error);
    }
  }

  async bulkDeleteUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const actor = {
        id: new mongoose.Types.ObjectId(authReq.tenantUser.id),
        role: authReq.tenantUser.role,
      };
      const { ids } = req.body as { ids: string[] };

      const result = await tenantUserService.bulkDeleteUsers(ids, tenantId, actor);
      success(res, `${result.deleted} user(s) deleted.`, result);
    } catch (error) {
      next(error);
    }
  }
}

export const tenantUserController = new TenantUserController();
