import type { Request, Response, NextFunction } from 'express';
import type { ServiceKey } from '../../constants/serviceCatalog';
import type { AuthenticatedRequest } from '../../types';
import { tenantServiceConfigService } from './tenantServiceConfig.service';
import type {
  ServiceConfigCreateInput,
  ServiceConfigUpdateInput,
  VmManagementPricingInput,
} from './tenantServiceConfig.validation';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class TenantServiceConfigController {
  async assignService(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { tenantId } = req.params as { tenantId: string };
      const body = req.body as ServiceConfigCreateInput;

      const config = await tenantServiceConfigService.assignService(
        tenantId,
        body.serviceKey,
        body.limits,
        body.pricing,
        authReq.user.userId
      );

      success(res, 'Service assigned to tenant.', { config }, 201);
    } catch (error) {
      next(error);
    }
  }

  async listServices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const services = await tenantServiceConfigService.listServicesForTenant(tenantId);
      success(res, 'Tenant service configs retrieved.', { services });
    } catch (error) {
      next(error);
    }
  }

  async updateServiceConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, serviceKey } = req.params as {
        tenantId: string;
        serviceKey: ServiceKey;
      };
      const updates = req.body as ServiceConfigUpdateInput;

      const config = await tenantServiceConfigService.updateServiceConfig(
        tenantId,
        serviceKey,
        updates
      );

      success(res, 'Tenant service config updated.', { config });
    } catch (error) {
      next(error);
    }
  }

  async updateVmManagementPricing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const pricing = req.body as VmManagementPricingInput;

      const config = await tenantServiceConfigService.updateServiceConfig(tenantId, 'vm-management', {
        pricing,
      });

      success(res, 'VM management pricing updated.', { config });
    } catch (error) {
      next(error);
    }
  }

  async updateVmManagementAllowedTemplates(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const { allowedTemplateIds } = req.body as { allowedTemplateIds: number[] };

      const config = await tenantServiceConfigService.updateServiceConfig(tenantId, 'vm-management', {
        limits: { allowedTemplateIds },
      });

      success(res, 'VM management allowed templates updated.', { config });
    } catch (error) {
      next(error);
    }
  }

  async removeService(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, serviceKey } = req.params as {
        tenantId: string;
        serviceKey: ServiceKey;
      };
      const force = Boolean(req.query['force']);

      const result = await tenantServiceConfigService.removeService(
        tenantId,
        serviceKey,
        force
      );

      if ('deleted' in result && result.deleted) {
        success(res, 'Tenant service config removed.', { serviceKey: result.serviceKey });
        return;
      }

      success(res, 'Tenant service config suspended.', { config: result });
    } catch (error) {
      next(error);
    }
  }

  async getVmManagementPlatformTemplates(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const data = await tenantServiceConfigService.getVmManagementPlatformTemplates(tenantId);
      success(res, 'VM management platform templates retrieved.', data);
    } catch (error) {
      next(error);
    }
  }

  async getVmManagementOrderableTemplates(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const templates =
        await tenantServiceConfigService.getVmManagementOrderableTemplatesForTenant(tenantId);
      success(res, 'Tenant orderable templates retrieved.', { templates });
    } catch (error) {
      next(error);
    }
  }
}

export const tenantServiceConfigController = new TenantServiceConfigController();
