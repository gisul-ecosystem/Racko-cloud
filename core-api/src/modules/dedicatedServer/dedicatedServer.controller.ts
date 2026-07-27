import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../../types';
import { dedicatedServerService } from './dedicatedServer.service';
import type {
  AttachDedicatedRequestInput,
  CreateDedicatedPlanInput,
  CreateDedicatedRequestInput,
  UpdateDedicatedPlanInput,
} from './dedicatedServer.validation';
import type { DedicatedServerStatus } from '../../models/dedicatedServerRequest.model';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

async function listPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const activeOnly = authReq.user.role === 'admin';
    const applySellPrice = authReq.user.role === 'admin';
    const plans = await dedicatedServerService.listPlans({ activeOnly, applySellPrice });
    success(res, 'Dedicated server plans retrieved.', { plans, total: plans.length });
  } catch (err) {
    next(err);
  }
}

async function createPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateDedicatedPlanInput;
    const plan = await dedicatedServerService.createPlan(
      body,
      new mongoose.Types.ObjectId(authReq.user.userId)
    );
    success(res, 'Dedicated server plan created.', { plan }, 201);
  } catch (err) {
    next(err);
  }
}

async function updatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const body = req.body as UpdateDedicatedPlanInput;
    const plan = await dedicatedServerService.updatePlan(id, body);
    success(res, 'Dedicated server plan updated.', { plan });
  } catch (err) {
    next(err);
  }
}

async function deletePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    await dedicatedServerService.deletePlan(id);
    success(res, 'Dedicated server plan deleted.', {});
  } catch (err) {
    next(err);
  }
}

async function seedPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await dedicatedServerService.seedPlansIfEmpty(
      new mongoose.Types.ObjectId(authReq.user.userId)
    );
    success(res, 'Dedicated server plans seed completed.', result);
  } catch (err) {
    next(err);
  }
}

async function getPricingSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await dedicatedServerService.getPricingSettings();
    success(res, 'Dedicated server pricing settings retrieved.', settings);
  } catch (err) {
    next(err);
  }
}

async function updatePricingSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const { sellMultiplier } = req.body as { sellMultiplier: number };
    const settings = await dedicatedServerService.updatePricingSettings(
      sellMultiplier,
      new mongoose.Types.ObjectId(authReq.user.userId)
    );
    success(res, 'Dedicated server pricing settings updated.', settings);
  } catch (err) {
    next(err);
  }
}

async function createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateDedicatedRequestInput;
    const request = await dedicatedServerService.createRequest(
      body,
      new mongoose.Types.ObjectId(authReq.user.userId)
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
}

async function listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const servers = await dedicatedServerService.listForAdmin(
      new mongoose.Types.ObjectId(authReq.user.userId)
    );
    success(res, 'Dedicated servers retrieved.', { servers, total: servers.length });
  } catch (err) {
    next(err);
  }
}

async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const server = await dedicatedServerService.getForAdmin(
      id,
      new mongoose.Types.ObjectId(authReq.user.userId)
    );
    success(res, 'Dedicated server retrieved.', { server });
  } catch (err) {
    next(err);
  }
}

async function openConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const rawWidth = req.query['width'] as string | undefined;
    const rawHeight = req.query['height'] as string | undefined;
    const width = rawWidth ? parseInt(rawWidth, 10) : undefined;
    const height = rawHeight ? parseInt(rawHeight, 10) : undefined;
    const session = await dedicatedServerService.openConsole(
      id,
      new mongoose.Types.ObjectId(authReq.user.userId),
      {
        width: width && Number.isFinite(width) && width > 0 ? width : undefined,
        height: height && Number.isFinite(height) && height > 0 ? height : undefined,
      }
    );
    success(res, 'Dedicated server console session created.', session);
  } catch (err) {
    next(err);
  }
}

async function listRequesters(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requesters = await dedicatedServerService.listRequesterGroups();
    success(res, 'Dedicated server requesters retrieved.', {
      requesters,
      total: requesters.length,
    });
  } catch (err) {
    next(err);
  }
}

async function listRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status =
      (req.query['status'] as DedicatedServerStatus | 'all' | undefined) ?? 'provisioning';
    const adminIdRaw = req.query['adminId'] as string | undefined;
    const requests = await dedicatedServerService.listRequestsForSuperAdmin({
      status,
      adminId: adminIdRaw ? new mongoose.Types.ObjectId(adminIdRaw) : undefined,
    });
    success(res, 'Dedicated server requests retrieved.', { requests, total: requests.length });
  } catch (err) {
    next(err);
  }
}

async function attach(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const body = req.body as AttachDedicatedRequestInput;
    const request = await dedicatedServerService.attachRequest(
      id,
      new mongoose.Types.ObjectId(authReq.user.userId),
      body
    );
    success(res, 'Dedicated server attached and visible to the admin.', { request });
  } catch (err) {
    next(err);
  }
}

async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const { reason } = req.body as { reason: string };
    const request = await dedicatedServerService.rejectRequest(
      id,
      new mongoose.Types.ObjectId(authReq.user.userId),
      reason
    );
    success(res, 'Dedicated server request rejected.', { request });
  } catch (err) {
    next(err);
  }
}

export const dedicatedServerController = {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  seedPlans,
  getPricingSettings,
  updatePricingSettings,
  createRequest,
  listMine,
  getOne,
  openConsole,
  listRequesters,
  listRequests,
  attach,
  reject,
};
