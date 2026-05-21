import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import type { AuthenticatedRequest } from '../../types';

// Consistent response shape
function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body as { email: string; password: string }, req);
      success(res, result.message, undefined, 201);
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body as { token: string };
      const result = await authService.verifyEmail(token, req);
      success(res, result.message);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(
        req.body as { email: string; password: string },
        req,
        res
      );
      success(res, 'Login successful.', { accessToken: result.accessToken, user: result.user });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.refreshToken(req, res);
      success(res, 'Token refreshed.', { accessToken: result.accessToken });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.logout(req, res);
      success(res, result.message);
    } catch (error) {
      next(error);
    }
  }

  async validateTokenForGateway(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { accessToken } = req.body as { accessToken: string };
      const result = await authService.validateTokenForGateway(accessToken, req);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = await authService.getCurrentUser(authReq.user.userId);
      success(res, 'User retrieved.', { user });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
