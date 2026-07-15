import type { Request, Response, NextFunction } from 'express';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { walletService } from './wallet.service';
import { createTopupOrder } from '../billing/razorpay/razorpayClient';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class WalletController {
  async getWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const wallet = await walletService.getOrCreateWallet(authReq.tenantUser.tenantId);
      success(res, 'Wallet retrieved.', wallet);
    } catch (error) {
      next(error);
    }
  }

  async listTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const result = await walletService.listTransactions(
        authReq.tenantUser.tenantId,
        page,
        limit
      );
      success(res, 'Wallet transactions retrieved.', result);
    } catch (error) {
      next(error);
    }
  }

  async createTopup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { amount } = req.body as { amount: number };
      const order = await createTopupOrder(authReq.tenantUser.tenantId, amount);
      success(res, 'Top-up order created.', order, 201);
    } catch (error) {
      next(error);
    }
  }

  async chargeCloudRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { amountUsd, relatedRequestId, provider } = req.body as {
        amountUsd: number;
        relatedRequestId?: string | null;
        provider?: 'azure' | 'aws';
      };
      const result = await walletService.chargeCloudRequest(
        authReq.tenantUser.tenantId,
        amountUsd,
        relatedRequestId ?? null,
        provider ?? 'azure'
      );
      success(res, 'Wallet charged for cloud lab request.', result);
    } catch (error) {
      next(error);
    }
  }

  async refundCloudRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { amountInr, relatedRequestId, provider } = req.body as {
        amountInr: number;
        relatedRequestId?: string | null;
        provider?: 'azure' | 'aws';
      };
      const wallet = await walletService.refundCloudRequestCharge(
        authReq.tenantUser.tenantId,
        amountInr,
        relatedRequestId ?? null,
        provider ?? 'azure'
      );
      success(res, 'Cloud lab charge refunded to wallet.', wallet);
    } catch (error) {
      next(error);
    }
  }

  async linkCloudRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const { relatedRequestId, provider } = req.body as {
        relatedRequestId: string;
        provider?: 'azure' | 'aws';
      };
      await walletService.linkCloudRequestCharge(
        authReq.tenantUser.tenantId,
        relatedRequestId,
        provider ?? 'azure'
      );
      success(res, 'Wallet charge linked to cloud request.', { relatedRequestId });
    } catch (error) {
      next(error);
    }
  }
}

export const walletController = new WalletController();
