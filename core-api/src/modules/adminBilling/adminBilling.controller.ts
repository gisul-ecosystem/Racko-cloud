import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { adminBillingService } from './adminBilling.service';
import { createAdminTopupOrder } from '../billing/razorpay/razorpayClient';
import type { TemplateRates } from '../../models/adminPricingConfig.model';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

function transactionFilters(req: Request): { projectId?: string; serviceKey?: string } {
  const filters: { projectId?: string; serviceKey?: string } = {};
  const projectId = String(req.query['projectId'] ?? '').trim();
  const serviceKey = String(req.query['serviceKey'] ?? '').trim();
  if (projectId) filters.projectId = projectId;
  if (serviceKey) filters.serviceKey = serviceKey;
  return filters;
}

export class AdminBillingController {
  // ── Pricing ───────────────────────────────────────────────────────────────

  async topupMyWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { amount } = req.body as { amount: number };
      const order = await createAdminTopupOrder(authReq.user.userId, amount);
      success(res, 'Admin wallet top-up order created.', order, 201);
    } catch (err) {
      next(err);
    }
  }

  async getPricing(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pricing = await adminBillingService.getPricing();
      success(res, 'Admin pricing config retrieved.', pricing);
    } catch (err) {
      next(err);
    }
  }

  async savePricing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { templatePricing } = req.body as { templatePricing: Record<string, TemplateRates> };
      const pricing = await adminBillingService.savePricing(templatePricing, authReq.user.userId);
      success(res, 'Admin pricing config saved.', pricing);
    } catch (err) {
      next(err);
    }
  }

  // ── Wallet ────────────────────────────────────────────────────────────────

  async getMyWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const wallet = await adminBillingService.getOrCreateWallet(authReq.user.userId);
      success(res, 'Admin wallet retrieved.', wallet);
    } catch (err) {
      next(err);
    }
  }

  async getWalletByUserId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params as { userId: string };
      const wallet = await adminBillingService.getOrCreateWallet(userId);
      success(res, 'Admin wallet retrieved.', wallet);
    } catch (err) {
      next(err);
    }
  }

  async creditWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId, amount } = req.body as { userId: string; amount: number };
      const wallet = await adminBillingService.creditWallet(userId, amount, authReq.user.userId);
      success(res, 'Admin wallet credited.', wallet, 201);
    } catch (err) {
      next(err);
    }
  }

  async listTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params as { userId: string };
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const result = await adminBillingService.listTransactions(
        userId,
        page,
        limit,
        transactionFilters(req)
      );
      success(res, 'Admin wallet transactions retrieved.', result);
    } catch (err) {
      next(err);
    }
  }

  async listMyTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const result = await adminBillingService.listTransactions(
        authReq.user.userId,
        page,
        limit,
        transactionFilters(req)
      );
      success(res, 'Admin wallet transactions retrieved.', result);
    } catch (err) {
      next(err);
    }
  }

  async getMyTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { txId } = req.params as { txId: string };
      const transaction = await adminBillingService.getTransaction(authReq.user.userId, txId);
      success(res, 'Admin wallet transaction retrieved.', { transaction });
    } catch (err) {
      next(err);
    }
  }

  // ── Quote ─────────────────────────────────────────────────────────────────

  async quote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { templateId, cpuCores, memoryGb, diskGb, count, billingPeriod } = req.body as {
        templateId: number;
        cpuCores: number;
        memoryGb: number;
        diskGb: number;
        count: number;
        billingPeriod: 'monthly' | 'quarterly' | 'yearly';
      };
      const quote = await adminBillingService.quoteVmCreation(
        templateId, cpuCores, memoryGb, diskGb, count, billingPeriod
      );
      success(res, 'Admin VM creation quote calculated.', quote);
    } catch (err) {
      next(err);
    }
  }

  async chargeCloudRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { amountUsd, relatedRequestId, provider, projectId, serviceKey } = req.body as {
        amountUsd: number;
        relatedRequestId?: string | null;
        provider?: 'azure' | 'aws' | 'gcp';
        projectId?: string;
        serviceKey?: 'azure' | 'aws' | 'gcp' | 'cloud-labs';
      };
      const normalizedProvider =
        provider === 'aws' ? 'aws' : provider === 'gcp' ? 'gcp' : 'azure';
      const result = await adminBillingService.chargeCloudRequest(
        authReq.user.userId,
        amountUsd,
        relatedRequestId ?? null,
        normalizedProvider,
        {
          projectId: projectId ?? null,
          serviceKey: serviceKey ?? null,
        }
      );
      success(res, 'Wallet charged for cloud lab request.', result);
    } catch (err) {
      next(err);
    }
  }

  async refundCloudRequestCharge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { amountInr, relatedRequestId } = req.body as {
        amountInr: number;
        relatedRequestId?: string | null;
      };
      const wallet = await adminBillingService.refundCloudRequestCharge(
        authReq.user.userId,
        amountInr,
        relatedRequestId ?? null
      );
      success(res, 'Cloud lab charge refunded to wallet.', wallet);
    } catch (err) {
      next(err);
    }
  }

  async linkCloudRequestCharge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { relatedRequestId } = req.body as { relatedRequestId: string };
      await adminBillingService.patchLatestTransactionJobId(
        authReq.user.userId,
        relatedRequestId
      );
      success(res, 'Wallet charge linked to cloud request.', { relatedRequestId });
    } catch (err) {
      next(err);
    }
  }
}

export const adminBillingController = new AdminBillingController();
