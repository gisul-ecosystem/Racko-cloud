import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import type { AuthenticatedRequest } from '../../types';
import { logger } from '../../utils/logger';

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
      logger.info('[auth-token] login:controller', {
        origin: req.headers.origin ?? null,
        cookieHeaderPresent: !!(req.headers.cookie?.length),
        cookieNames: (req.headers.cookie ?? '')
          .split(';')
          .map((part) => part.trim().split('=')[0] ?? '')
          .filter(Boolean),
      });
      const result = await authService.login(
        req.body as { email: string; password: string },
        req,
        res
      );
      logger.info('[auth-token] login:controller-success', {
        userId: result.user.id,
        accessTokenLength: result.accessToken.length,
        setCookieHeaderPresent: !!res.getHeader('set-cookie'),
      });
      success(res, 'Login successful.', { accessToken: result.accessToken, user: result.user });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.info('[auth-token] refresh:controller', {
        origin: req.headers.origin ?? null,
        cookieHeaderPresent: !!(req.headers.cookie?.length),
        hasRefreshTokenCookie: !!req.cookies?.['refreshToken'],
        refreshTokenLength: (req.cookies?.['refreshToken'] as string | undefined)?.length ?? 0,
      });
      const result = await authService.refreshToken(req, res);
      logger.info('[auth-token] refresh:controller-success', {
        accessTokenLength: result.accessToken.length,
        setCookieHeaderPresent: !!res.getHeader('set-cookie'),
      });
      success(res, 'Token refreshed.', { accessToken: result.accessToken });
    } catch (error) {
      logger.warn('[auth-token] refresh:controller-failed', {
        message: error instanceof Error ? error.message : 'unknown_error',
      });
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

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as { email: string };
      await authService.forgotPassword(email, req);
      // Always same response — prevents email enumeration
      success(res, 'If an account with that email exists, a reset link has been sent.');
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body as { token: string; password: string };
      await authService.resetPassword(token, password, req);
      success(res, 'Password reset successful. You can now log in with your new password.');
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
