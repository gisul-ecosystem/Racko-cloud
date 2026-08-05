import type { Request, Response, NextFunction } from 'express';
import { tenantAuthService, TenantAuthError } from './tenantAuth.service';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { AccessWindowDeniedError } from '../../utils/errors';

function getTenantIdFromHeader(req: Request): string | null {
  const raw = req.headers['x-tenant-id'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({
    success: true,
    message,
    ...(data !== undefined && { data }),
  });
}

function tenantAuthFail(res: Response, error: TenantAuthError): void {
  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
  });
}

export class TenantAuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = getTenantIdFromHeader(req);
      if (!tenantId) {
        res.status(401).json({ success: false, message: 'TENANT_NOT_FOUND' });
        return;
      }

      const result = await tenantAuthService.login(tenantId, req.body);
      success(res, 'Login successful.', {
        accessToken: result.accessToken,
        tenantUser: result.tenantUser,
      });
    } catch (error) {
      if (error instanceof AccessWindowDeniedError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
          code: error.code,
          nextWindow: error.nextWindow,
        });
        return;
      }
      if (error instanceof TenantAuthError) {
        tenantAuthFail(res, error);
        return;
      }
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = getTenantIdFromHeader(req);
      if (!tenantId) {
        res.status(401).json({ success: false, message: 'TENANT_NOT_FOUND' });
        return;
      }

      const result = await tenantAuthService.verifyEmail(tenantId, req.body);
      success(res, result.message, {});
    } catch (error) {
      if (error instanceof TenantAuthError) {
        tenantAuthFail(res, error);
        return;
      }
      next(error);
    }
  }

  async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = getTenantIdFromHeader(req);
      if (!tenantId) {
        res.status(401).json({ success: false, message: 'TENANT_NOT_FOUND' });
        return;
      }

      await tenantAuthService.resendVerification(tenantId, req.body);
      success(res, 'If an account needs verification, a new link has been sent.', {});
    } catch (error) {
      next(error);
    }
  }

  async accessCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const data = await tenantAuthService.accessCheck(
        authReq.tenantUser.id,
        authReq.tenantUser.role
      );
      success(res, 'Access ok.', data);
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = getTenantIdFromHeader(req);
      if (!tenantId) {
        res.status(401).json({ success: false, message: 'TENANT_NOT_FOUND' });
        return;
      }

      await tenantAuthService.forgotPassword(tenantId, req.body);
      success(res, 'If an account exists, a reset link has been sent.', {});
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = getTenantIdFromHeader(req);
      if (!tenantId) {
        res.status(401).json({ success: false, message: 'TENANT_NOT_FOUND' });
        return;
      }

      await tenantAuthService.resetPassword(tenantId, req.body);
      success(res, 'Password reset successful.', {});
    } catch (error) {
      if (error instanceof TenantAuthError) {
        tenantAuthFail(res, error);
        return;
      }
      next(error);
    }
  }
}

export const tenantAuthController = new TenantAuthController();
