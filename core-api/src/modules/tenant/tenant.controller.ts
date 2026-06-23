import type { Request, Response, NextFunction } from 'express';
import type { ServiceKey } from '../../constants/serviceCatalog';
import { tenantService } from './tenant.service';
import type { AuthenticatedRequest } from '../../types';
import type { CreateTenantInput, CreateTenantAdminInput, UpdateTenantInput } from './tenant.validation';
import type { TenantStatus } from '../../models/tenant.model';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class TenantController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenant = await tenantService.createTenant(
        req.body as CreateTenantInput,
        authReq.user.userId
      );
      success(res, 'Tenant created.', { tenant }, 201);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const status = req.query['status'] as TenantStatus | undefined;

      const result = await tenantService.listTenants(page, limit, status);
      success(res, 'Tenants retrieved.', result);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const tenant = await tenantService.getTenantById(id);
      success(res, 'Tenant retrieved.', { tenant });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as UpdateTenantInput & { slug?: string; createdBy?: string };

      const updates: UpdateTenantInput = { ...body };
      delete (updates as { slug?: string }).slug;
      delete (updates as { createdBy?: string }).createdBy;

      const tenant = await tenantService.updateTenant(id, updates);
      success(res, 'Tenant updated.', { tenant });
    } catch (error) {
      next(error);
    }
  }

  async createAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const admin = await tenantService.createTenantAdmin(
        tenantId,
        req.body as CreateTenantAdminInput
      );
      success(res, 'Tenant admin created.', { admin }, 201);
    } catch (error) {
      next(error);
    }
  }

  async addServices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const { services } = req.body as { services: ServiceKey[] };
      const tenant = await tenantService.addServices(tenantId, services);
      success(res, 'Services added to tenant.', { tenant });
    } catch (error) {
      next(error);
    }
  }

  async removeServices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const { services } = req.body as { services: ServiceKey[] };
      const tenant = await tenantService.removeServices(tenantId, services);
      success(res, 'Services removed from tenant.', { tenant });
    } catch (error) {
      next(error);
    }
  }

  async setServices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const { services } = req.body as { services: ServiceKey[] };
      const tenant = await tenantService.setServices(tenantId, services);
      success(res, 'Tenant services updated.', { tenant });
    } catch (error) {
      next(error);
    }
  }

  async updateLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const limits = req.body as { maxVms?: number; maxManagedUsers?: number };
      const tenant = await tenantService.updateLimits(tenantId, limits);
      success(res, 'Tenant limits updated.', { tenant });
    } catch (error) {
      next(error);
    }
  }
}

export const tenantController = new TenantController();
