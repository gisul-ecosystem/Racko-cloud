import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { managedUsersService } from './managedUsers.service';
import type { AuthenticatedRequest } from '../../types';
import type { CreateSingleUserDto, CreateBulkUsersDto } from './managedUsers.types';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class ManagedUsersController {
  /**
   * POST /api/v1/managed-users/single
   */
  async createSingle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const dto = req.body as CreateSingleUserDto;

      const user = await managedUsersService.createSingle(dto, adminId);
      success(res, 'User created successfully.', { user }, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/managed-users/bulk
   */
  async createBulk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const dto = req.body as CreateBulkUsersDto;

      const result = await managedUsersService.createBulk(dto, adminId);
      success(res, `Bulk user creation complete. ${result.created} created, ${result.failed} failed.`, result, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/managed-users
   */
  async listMyUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const users = await managedUsersService.listMyUsers(adminId);
      success(res, 'Users retrieved.', { users, total: users.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/managed-users/:userId/active
   */
  async setUserActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const { userId } = req.params as { userId: string };
      const { isActive } = req.body as { isActive: boolean };

      const user = await managedUsersService.setUserActive(userId, isActive, adminId);
      success(res, `User ${isActive ? 'activated' : 'deactivated'}.`, { user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/managed-users/:userId
   */
  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const { userId } = req.params as { userId: string };

      await managedUsersService.deleteUser(userId, adminId);
      success(res, 'User deleted.');
    } catch (error) {
      next(error);
    }
  }
}

export const managedUsersController = new ManagedUsersController();
