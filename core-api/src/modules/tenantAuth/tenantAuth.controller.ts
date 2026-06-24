import type { Request, Response, NextFunction } from 'express';
import { tenantAuthService, TenantAuthError } from './tenantAuth.service';

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
      if (error instanceof TenantAuthError) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
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
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }
}

export const tenantAuthController = new TenantAuthController();
