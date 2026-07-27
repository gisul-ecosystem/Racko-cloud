import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { dedicatedServerService } from '../dedicatedServer/dedicatedServer.service';
import type { CreateDedicatedRequestInput } from '../dedicatedServer/dedicatedServer.validation';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export const tenantDedicatedServerController = {
  async listPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await dedicatedServerService.listPlans({ activeOnly: true, applySellPrice: true });
      success(res, 'Dedicated server plans retrieved.', { plans, total: plans.length });
    } catch (err) {
      next(err);
    }
  },

  async listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const servers = await dedicatedServerService.listForTenant(tenantId);
      success(res, 'Dedicated servers retrieved.', { servers, total: servers.length });
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const server = await dedicatedServerService.getForTenant(id, tenantId);
      success(res, 'Dedicated server retrieved.', { server });
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
      const session = await dedicatedServerService.openConsoleForTenant(id, tenantId, {
        width: width && Number.isFinite(width) && width > 0 ? width : undefined,
        height: height && Number.isFinite(height) && height > 0 ? height : undefined,
      });
      success(res, 'Dedicated server console session created.', session);
    } catch (err) {
      next(err);
    }
  },

  async createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const tenantUserId = new mongoose.Types.ObjectId(authReq.tenantUser.id);
      const body = req.body as CreateDedicatedRequestInput;
      const request = await dedicatedServerService.createRequestForTenant(
        body,
        tenantId,
        tenantUserId
      );
      success(
        res,
        'Dedicated server request submitted. Wallet charged; awaiting fulfillment.',
        { request },
        201
      );
    } catch (err) {
      next(err);
    }
  },
};
