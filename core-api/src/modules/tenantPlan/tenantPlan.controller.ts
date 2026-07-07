import type { Request, Response, NextFunction } from 'express';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { tenantPlanService } from './tenantPlan.service';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class TenantPlanController {
  async listPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const plans = await tenantPlanService.listPlans(authReq.tenantUser.tenantId);
      success(res, 'VM plans retrieved.', { plans });
    } catch (error) {
      next(error);
    }
  }

  async getPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { vmId } = req.params as { vmId: string };
      const plan = await tenantPlanService.getPlan(authReq.tenantUser.tenantId, vmId);
      success(res, 'VM plan retrieved.', { plan });
    } catch (error) {
      next(error);
    }
  }

  async quotePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { vmId } = req.params as { vmId: string };
      const quote = await tenantPlanService.quotePlan(authReq.tenantUser.tenantId, vmId);
      success(res, 'Plan quote calculated.', quote);
    } catch (error) {
      next(error);
    }
  }

  async extendPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { vmId } = req.params as { vmId: string };
      const result = await tenantPlanService.extendPlan(authReq.tenantUser.tenantId, vmId);
      success(res, 'Plan extended.', result);
    } catch (error) {
      next(error);
    }
  }

  async renewPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { vmId } = req.params as { vmId: string };
      const result = await tenantPlanService.renewPlan(authReq.tenantUser.tenantId, vmId);
      success(res, 'Plan renewed and VM started.', result);
    } catch (error) {
      next(error);
    }
  }

  async listHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { vmId } = req.params as { vmId: string };
      const history = await tenantPlanService.listRenewalHistory(
        authReq.tenantUser.tenantId,
        vmId
      );
      success(res, 'Plan payment history retrieved.', { history });
    } catch (error) {
      next(error);
    }
  }
}

export const tenantPlanController = new TenantPlanController();
