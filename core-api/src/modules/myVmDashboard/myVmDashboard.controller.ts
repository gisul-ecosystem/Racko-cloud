import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { myVmDashboardService } from './myVmDashboard.service';
import type { AuthenticatedRequest } from '../../types';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';

function ok<T>(res: Response, data: T): void {
  res.status(200).json({ success: true, message: 'My VM Dashboard retrieved.', data });
}

export class MyVmDashboardController {
  /** GET /api/v1/my-vms — platform admin. */
  async listForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const result = await myVmDashboardService.listForAdmin(
        new mongoose.Types.ObjectId(userId)
      );
      ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/tenant-my-vms — tenant admin. */
  async listForTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = (req as TenantAuthenticatedRequest).tenantUser;
      const result = await myVmDashboardService.listForTenant(
        new mongoose.Types.ObjectId(tenantId)
      );
      ok(res, result);
    } catch (err) {
      next(err);
    }
  }
}

export const myVmDashboardController = new MyVmDashboardController();
