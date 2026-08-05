import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { vmCatalogService } from '../vmCatalog/vmCatalog.service';
import { vmCatalogPlanService } from '../vmCatalog/vmCatalogPlan.service';
import type { CreateCatalogVmRequestInput } from '../vmCatalog/vmCatalog.validation';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export const tenantVmCatalogController = {
  async listPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const plans = await vmCatalogPlanService.list({
        activeOnly: true,
        applySellPrice: true,
        forCustomer: true,
        account: {
          scopeType: 'tenant',
          tenantId: authReq.tenantUser.tenantId,
        },
      });
      success(res, 'VM catalog plans retrieved.', { plans, total: plans.length });
    } catch (err) {
      next(err);
    }
  },

  async overview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const data = await vmCatalogService.getOverviewForTenant(tenantId);
      success(res, 'VM catalog overview retrieved.', data);
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const vms = await vmCatalogService.listForTenant(tenantId);
      success(res, 'VM catalog instances retrieved.', { vms, total: vms.length });
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const vm = await vmCatalogService.getForTenant(id, tenantId);
      success(res, 'Catalog VM retrieved.', { vm });
    } catch (err) {
      next(err);
    }
  },

  async openConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const rawWidth = req.query['width'] as string | undefined;
      const rawHeight = req.query['height'] as string | undefined;
      const width = rawWidth ? parseInt(rawWidth, 10) : undefined;
      const height = rawHeight ? parseInt(rawHeight, 10) : undefined;
      const session = await vmCatalogService.openConsoleForTenant(id, tenantId, {
        width: width && Number.isFinite(width) && width > 0 ? width : undefined,
        height: height && Number.isFinite(height) && height > 0 ? height : undefined,
      });
      success(res, 'Catalog VM console session created.', session);
    } catch (err) {
      next(err);
    }
  },

  async createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const tenantUserId = new mongoose.Types.ObjectId(authReq.tenantUser.id);
      const body = req.body as CreateCatalogVmRequestInput;
      const request = await vmCatalogService.createRequestForTenant(body, tenantId, tenantUserId);
      success(
        res,
        'Catalog VM purchase submitted. Wallet charged; VM is provisioning.',
        { request },
        201
      );
    } catch (err) {
      next(err);
    }
  },
};
