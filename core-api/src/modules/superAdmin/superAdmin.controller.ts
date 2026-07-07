import type { Request, Response, NextFunction } from 'express';
import { superAdminService } from './superAdmin.service';
import { superAdminWalletService } from '../wallet/superAdminWallet.service';
import type { AuthenticatedRequest } from '../../types';
import { generateFingerprint, getClientIp } from '../../utils/deviceFingerprint';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class SuperAdminController {
  async overview(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const overview = await superAdminService.getOverview();
      success(res, 'Super admin overview retrieved.', overview);
    } catch (error) {
      next(error);
    }
  }

  async listTenantAdmins(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const admins = await superAdminService.listTenantAdmins(tenantId);
      success(res, 'Tenant admins retrieved.', { admins });
    } catch (error) {
      next(error);
    }
  }

  async setTenantAdminActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, tenantUserId } = req.params as {
        tenantId: string;
        tenantUserId: string;
      };
      const { isActive } = req.body as { isActive: boolean };

      const admin = await superAdminService.setTenantAdminActive(
        tenantId,
        tenantUserId,
        isActive
      );
      success(res, `Tenant admin ${isActive ? 'activated' : 'deactivated'}.`, { admin });
    } catch (error) {
      next(error);
    }
  }

  async getTenantWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const wallet = await superAdminWalletService.getWallet(tenantId);
      success(res, 'Tenant wallet retrieved.', wallet);
    } catch (error) {
      next(error);
    }
  }

  async listTenantWalletTransactions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const result = await superAdminWalletService.listTransactions(tenantId, page, limit);
      success(res, 'Tenant wallet transactions retrieved.', result);
    } catch (error) {
      next(error);
    }
  }

  async listTenantManualCredits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const result = await superAdminWalletService.listManualCredits(tenantId, page, limit);
      success(res, 'Manual wallet credits retrieved.', result);
    } catch (error) {
      next(error);
    }
  }

  async manualCreditTenantWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { tenantId } = req.params as { tenantId: string };
      const body = req.body as {
        amount: number;
        paymentReference: string;
        paymentMethod: 'upi' | 'bank_transfer' | 'cash' | 'other';
        internalNote?: string;
      };

      const idempotencyKey =
        typeof req.headers['idempotency-key'] === 'string'
          ? req.headers['idempotency-key']
          : undefined;

      const result = await superAdminWalletService.manualCredit(
        tenantId,
        authReq.user.userId,
        body,
        {
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] ?? 'unknown',
          deviceFingerprint: generateFingerprint(req),
        },
        idempotencyKey
      );

      const statusCode = result.idempotentReplay ? 200 : 201;
      const message = result.idempotentReplay
        ? 'Manual wallet credit already applied.'
        : 'Manual wallet credit applied.';
      success(res, message, result, statusCode);
    } catch (error) {
      next(error);
    }
  }
}

export const superAdminController = new SuperAdminController();
