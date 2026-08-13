import type { Request, Response, NextFunction } from 'express';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { tenantServiceConfigService } from './tenantServiceConfig.service';
import { serviceCatalogService } from '../serviceCatalog/serviceCatalog.service';

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
          ...(service.label ? { label: service.label } : {}),
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async listCatalog(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const services = await serviceCatalogService.list({
        kind: 'product',
        scope: 'tenant',
        activeOnly: true,
      });
      success(res, 'Service catalog retrieved.', {
        services: services.map((s) => ({
          key: s.key,
          label: s.label,
          description: s.description,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
}

export const tenantPortalServicesController = new TenantPortalServicesController();
