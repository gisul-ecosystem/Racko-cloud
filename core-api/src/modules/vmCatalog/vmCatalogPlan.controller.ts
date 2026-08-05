import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../../types';
import { User } from '../../models/user.model';
import { accountVmPricingService } from '../accountVmPricing/accountVmPricing.service';
import { vmCatalogPlanService } from './vmCatalogPlan.service';
import type {
  CreateVmCatalogPlanInput,
  UpdateVmCatalogPlanInput,
} from './vmCatalogPlan.validation';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

async function listPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const activeOnly = authReq.user.role === 'admin';
    const applySellPrice = authReq.user.role === 'admin';
    const forCustomer = authReq.user.role === 'admin';

    let account = null;
    if (applySellPrice) {
      const user = await User.findById(authReq.user.userId)
        .select('role orgOwnerId')
        .lean();
      const orgId = user
        ? accountVmPricingService.resolveOrgIdFromUser({
            _id: user._id,
            role: user.role,
            orgOwnerId: user.orgOwnerId,
          })
        : null;
      if (orgId) account = { scopeType: 'organization' as const, orgId };
    }

    const plans = await vmCatalogPlanService.list({
      activeOnly,
      applySellPrice,
      forCustomer,
      account,
    });
    success(res, 'VM catalog plans retrieved.', { plans, total: plans.length });
  } catch (err) {
    next(err);
  }
}

async function createPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateVmCatalogPlanInput;
    const plan = await vmCatalogPlanService.create(
      body,
      new mongoose.Types.ObjectId(authReq.user.userId)
    );
    success(res, 'VM catalog plan created.', { plan }, 201);
  } catch (err) {
    next(err);
  }
}

async function updatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] as string;
    const body = req.body as UpdateVmCatalogPlanInput;
    const plan = await vmCatalogPlanService.update(id, body);
    success(res, 'VM catalog plan updated.', { plan });
  } catch (err) {
    next(err);
  }
}

async function deletePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] as string;
    await vmCatalogPlanService.remove(id);
    success(res, 'VM catalog plan deleted.', { deleted: true });
  } catch (err) {
    next(err);
  }
}

async function seedPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await vmCatalogPlanService.seedDefaultsIfEmpty(
      new mongoose.Types.ObjectId(authReq.user.userId)
    );
    success(res, 'VM catalog plans seed completed.', result);
  } catch (err) {
    next(err);
  }
}

export const vmCatalogPlanController = {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  seedPlans,
};
