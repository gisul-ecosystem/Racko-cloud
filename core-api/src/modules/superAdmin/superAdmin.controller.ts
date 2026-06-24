import type { Request, Response, NextFunction } from 'express';
import { superAdminService } from './superAdmin.service';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class SuperAdminController {
  async overview(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const overview = await superAdminService.getOverview();
      success(res, 'Super admin overview retrieved.', overview);
    } catch (error) {
      next(error);
    }
  }

  async listTenantAdmins(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const admins = await superAdminService.listTenantAdmins(tenantId);
      success(res, 'Tenant admins retrieved.', { admins });
    } catch (error) {
      next(error);
    }
  }

  async setTenantAdminActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, tenantUserId } = req.params as {
        tenantId: string;
        tenantUserId: string;
      };
      const { isActive } = req.body as { isActive: boolean };

      const admin = await superAdminService.setTenantAdminActive(
        tenantId,
        tenantUserId,
        isActive
      );
      success(res, `Tenant admin ${isActive ? 'activated' : 'deactivated'}.`, { admin });
    } catch (error) {
      next(error);
    }
  }
}

export const superAdminController = new SuperAdminController();
