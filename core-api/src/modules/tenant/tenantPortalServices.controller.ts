import type { Request, Response, NextFunction } from 'express';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { tenantServiceConfigService } from './tenantServiceConfig.service';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class TenantPortalServicesController {
  async listMyServices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const services = await tenantServiceConfigService.listServicesForTenant(
        authReq.tenantUser.tenantId
      );

      success(res, 'Tenant services retrieved.', {
        services: services.map((service) => ({
          serviceKey: service.serviceKey,
          status: service.status,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
}

export const tenantPortalServicesController = new TenantPortalServicesController();
