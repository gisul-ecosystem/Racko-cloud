import type { Request, Response, NextFunction } from 'express';
import { userService } from './user.service';
import type { AuthenticatedRequest } from '../../types';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class UserController {
  async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const user = await userService.getUserById(id);
      success(res, 'User retrieved.', { user });
    } catch (error) {
      next(error);
    }
  }

  async listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await userService.listUsers();
      success(res, 'Users retrieved.', { users });
    } catch (error) {
      next(error);
    }
  }

  async setUserActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const { isActive } = req.body as { isActive: boolean };
      const user = await userService.setUserActive(id, isActive, authReq.user.userId);
      success(res, `User ${isActive ? 'activated' : 'deactivated'}.`, { user });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
