import type { Request, Response, NextFunction } from 'express';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { ForbiddenError } from '../../utils/errors';
import { tenantOverviewService } from './tenantOverview.service';

function success<T>(res: Response, message: string, data: T): void {
  res.status(200).json({ success: true, message, data });
}

export class TenantOverviewController {
  getOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = authReq.tenantUser?.tenantId;
      if (!tenantId) throw new ForbiddenError('Tenant authentication required.');

      const overview = await tenantOverviewService.getOverview(tenantId);
      success(res, 'Tenant overview retrieved.', overview);
    } catch (err) {
      next(err);
    }
  };
}

export const tenantOverviewController = new TenantOverviewController();
