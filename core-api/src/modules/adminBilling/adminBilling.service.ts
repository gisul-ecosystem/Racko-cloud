import mongoose from 'mongoose';
import { AdminWallet } from '../../models/adminWallet.model';
import { AdminWalletTransaction } from '../../models/adminWalletTransaction.model';
import { AdminPricingConfig, type TemplateRates } from '../../models/adminPricingConfig.model';
import type { AdminServiceKey } from '../../constants/adminServiceCatalog';
import { AppError, NotFoundError, ValidationError } from '../../utils/errors';
import { projectsService } from '../projects/projects.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminWalletPublic {
  balance: number;
  currency: string;
}

export interface AdminWalletTransactionPublic {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  relatedVmJobId: string | null;
  creditedBy: string | null;
  balanceAfter: number;
  projectId: string | null;
  serviceKey: string | null;
  createdAt: Date;
}

export interface AdminPricingPublic {
  templatePricing: Record<string, TemplateRates>;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export interface AdminQuoteResult {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  billingPeriod: 'monthly' | 'quarterly' | 'yearly';
  cpuCost: number;
  ramCost: number;
  diskCost: number;
  subtotal: number;
  discountPct: number;
  total: number;
  count: number;
  grandTotal: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyBillingMultiplier(
  monthly: number,
  period: 'monthly' | 'quarterly' | 'yearly',
  discounts: { quarterly: number; yearly: number }
): { multiplied: number; discountPct: number } {
  if (period === 'quarterly') {
    return { multiplied: monthly * 3 * (1 - discounts.quarterly), discountPct: discounts.quarterly * 100 };
  }
  if (period === 'yearly') {
    return { multiplied: monthly * 12 * (1 - discounts.yearly), discountPct: discounts.yearly * 100 };
  }
  return { multiplied: monthly, discountPct: 0 };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AdminBillingService {
  // ── Wallet ────────────────────────────────────────────────────────────────

  async getOrCreateWallet(userId: string): Promise<AdminWalletPublic & { usdToInrRate: number }> {
    const oid = new mongoose.Types.ObjectId(userId);
    const wallet = await AdminWallet.findOneAndUpdate(
      { userId: oid },
      { $setOnInsert: { userId: oid, balance: 0, currency: 'INR' } },
      { upsert: true, new: true }
    );
    return {
      balance: wallet.balance,
      currency: wallet.currency,
      usdToInrRate: this.getUsdToInrRate(),
    };
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  async creditWallet(
    userId: string,
    amount: number,
    creditedBy: string,
    reason: 'manual_credit' | 'razorpay_topup' | 'refund' = 'manual_credit'
  ): Promise<AdminWalletPublic> {
    if (amount <= 0) throw new ValidationError('Amount must be positive.');
    const oid = new mongoose.Types.ObjectId(userId);

    const wallet = await AdminWallet.findOneAndUpdate(
      { userId: oid },
      { $inc: { balance: amount }, $setOnInsert: { userId: oid, currency: 'INR' } },
      { upsert: true, new: true }
    );
    if (!wallet) throw new AppError('Failed to update wallet.', 500, 'INTERNAL_ERROR');

    await AdminWalletTransaction.create({
      userId: oid,
      type: 'credit',
      amount,
      reason,
      relatedVmJobId: null,
      creditedBy: new mongoose.Types.ObjectId(creditedBy),
      balanceAfter: wallet.balance,
    });

    return { balance: wallet.balance, currency: wallet.currency };
  }

  getUsdToInrRate(): number {
    const configured = Number(process.env.USD_TO_INR_RATE);
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return 95.12;
  }

  usdToInr(amountUsd: number): number {
    const converted = amountUsd * this.getUsdToInrRate();
    return Math.round(converted * 100) / 100;
  }

  async debitWallet(
    userId: string,
    amount: number,
    relatedVmJobId: string | null = null,
    reason:
      | 'vm_creation'
      | 'azure_lab_request'
      | 'aws_lab_request'
      | 'catalog_vm_purchase'
      | 'dedicated_server_purchase' = 'vm_creation',
    attribution?: {
      projectId?: string | null;
      orgId?: string | null;
      serviceKey?: string | null;
    }
  ): Promise<AdminWalletPublic> {
    if (amount <= 0) throw new ValidationError('Amount must be positive.');
    const oid = new mongoose.Types.ObjectId(userId);

    const wallet = await AdminWallet.findOneAndUpdate(
      { userId: oid, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );

    if (!wallet) {
      throw new AppError(
        'Insufficient wallet balance. Please top up your wallet and try again.',
        402,
        'INSUFFICIENT_BALANCE'
      );
    }

    await AdminWalletTransaction.create({
      userId: oid,
      type: 'debit',
      amount,
      reason,
      relatedVmJobId,
      orgId:
        attribution?.orgId && mongoose.Types.ObjectId.isValid(attribution.orgId)
          ? new mongoose.Types.ObjectId(attribution.orgId)
          : null,
      projectId:
        attribution?.projectId && mongoose.Types.ObjectId.isValid(attribution.projectId)
          ? new mongoose.Types.ObjectId(attribution.projectId)
          : null,
      serviceKey: attribution?.serviceKey ?? null,
      creditedBy: null,
      balanceAfter: wallet.balance,
    });

    return { balance: wallet.balance, currency: wallet.currency };
  }

  async chargeCloudRequest(
    userId: string,
    amountUsd: number,
    relatedRequestId: string | null = null,
    provider: 'azure' | 'aws' = 'azure',
    attribution?: {
      projectId?: string | null;
      serviceKey?: AdminServiceKey | null;
    }
  ): Promise<{
    balance: number;
    currency: string;
    chargedInr: number;
    amountUsd: number;
    usdToInrRate: number;
    provider: 'azure' | 'aws';
  }> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new ValidationError('Estimated amount must be a positive number.');
    }

    const serviceKey: AdminServiceKey =
      attribution?.serviceKey || (provider === 'aws' ? 'aws' : 'azure');
    let projectId: string | null = attribution?.projectId ?? null;
    let orgId: string | null = null;

    if (projectId) {
      const usable = await projectsService.assertUsableForService({
        projectId,
        actingUserId: userId,
        serviceKey,
      });
      projectId = usable.projectId.toString();
      orgId = usable.orgId;
    }

    const usdToInrRate = this.getUsdToInrRate();
    const chargedInr = this.usdToInr(amountUsd);
    const reason = provider === 'aws' ? 'aws_lab_request' : 'azure_lab_request';
    const wallet = await this.debitWallet(userId, chargedInr, relatedRequestId, reason, {
      projectId,
      orgId,
      serviceKey,
    });

    return {
      balance: wallet.balance,
      currency: wallet.currency,
      chargedInr,
      amountUsd: Math.round(amountUsd * 100) / 100,
      usdToInrRate,
      provider,
    };
  }

  async refundCloudRequestCharge(
    userId: string,
    amountInr: number,
    relatedRequestId: string | null = null
  ): Promise<AdminWalletPublic> {
    return this.creditWallet(userId, amountInr, userId, 'refund').then(async (wallet) => {
      if (relatedRequestId) {
        await AdminWalletTransaction.findOneAndUpdate(
          {
            userId: new mongoose.Types.ObjectId(userId),
            type: 'credit',
            reason: 'refund',
            relatedVmJobId: null,
          },
          { $set: { relatedVmJobId: relatedRequestId } },
          { sort: { createdAt: -1 } }
        );
      }
      return wallet;
    });
  }

  /** Patches the jobId on the most recent unlinked debit transaction for a user. */
  async patchLatestTransactionJobId(userId: string, jobId: string): Promise<void> {
    await AdminWalletTransaction.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId), type: 'debit', relatedVmJobId: null },
      { $set: { relatedVmJobId: jobId } },
      { sort: { createdAt: -1 } }
    );
  }

  async listTransactions(
    userId: string,
    page = 1,
    limit = 20,
    filters?: { projectId?: string; serviceKey?: string }
  ): Promise<{ transactions: AdminWalletTransactionPublic[]; total: number; page: number; limit: number }> {
    const oid = new mongoose.Types.ObjectId(userId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const query: Record<string, unknown> = { userId: oid };
    if (filters?.projectId && mongoose.Types.ObjectId.isValid(filters.projectId)) {
      query['projectId'] = new mongoose.Types.ObjectId(filters.projectId);
    }
    if (filters?.serviceKey) {
      query['serviceKey'] = filters.serviceKey;
    }

    const [rows, total] = await Promise.all([
      AdminWalletTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      AdminWalletTransaction.countDocuments(query),
    ]);

    return {
      transactions: rows.map((r) => ({
        id: r._id.toString(),
        type: r.type,
        amount: r.amount,
        reason: r.reason,
        relatedVmJobId: r.relatedVmJobId ?? null,
        creditedBy: r.creditedBy ? r.creditedBy.toString() : null,
        balanceAfter: r.balanceAfter,
        projectId: r.projectId ? r.projectId.toString() : null,
        serviceKey: r.serviceKey ?? null,
        createdAt: r.createdAt,
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async getTransaction(
    userId: string,
    transactionId: string
  ): Promise<AdminWalletTransactionPublic> {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundError('Transaction not found.');
    }
    const row = await AdminWalletTransaction.findOne({
      _id: new mongoose.Types.ObjectId(transactionId),
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();
    if (!row) throw new NotFoundError('Transaction not found.');

    return {
      id: row._id.toString(),
      type: row.type,
      amount: row.amount,
      reason: row.reason,
      relatedVmJobId: row.relatedVmJobId ?? null,
      creditedBy: row.creditedBy ? row.creditedBy.toString() : null,
      balanceAfter: row.balanceAfter,
      projectId: row.projectId ? row.projectId.toString() : null,
      serviceKey: row.serviceKey ?? null,
      createdAt: row.createdAt,
    };
  }

  // ── Pricing ───────────────────────────────────────────────────────────────

  async getPricing(): Promise<AdminPricingPublic> {
    const doc = await AdminPricingConfig.findOne().lean();
    if (!doc) {
      return { templatePricing: {}, updatedBy: null, updatedAt: null };
    }
    const raw = doc.templatePricing as unknown as Record<string, TemplateRates> | Map<string, TemplateRates>;
    const pricing: Record<string, TemplateRates> =
      raw instanceof Map ? Object.fromEntries(raw.entries()) : (raw ?? {});
    return {
      templatePricing: pricing,
      updatedBy: doc.updatedBy ? doc.updatedBy.toString() : null,
      updatedAt: doc.updatedAt,
    };
  }

  async savePricing(
    templatePricing: Record<string, TemplateRates>,
    updatedBy: string
  ): Promise<AdminPricingPublic> {
    const doc = await AdminPricingConfig.findOneAndUpdate(
      {},
      { $set: { templatePricing, updatedBy: new mongoose.Types.ObjectId(updatedBy) } },
      { upsert: true, new: true }
    );
    const raw = doc.templatePricing as unknown as Record<string, TemplateRates> | Map<string, TemplateRates>;
    const pricing: Record<string, TemplateRates> =
      raw instanceof Map ? Object.fromEntries(raw.entries()) : (raw ?? {});
    return {
      templatePricing: pricing,
      updatedBy: doc.updatedBy ? doc.updatedBy.toString() : null,
      updatedAt: doc.updatedAt,
    };
  }

  getRatesForTemplate(
    pricing: Record<string, TemplateRates>,
    templateId: number
  ): TemplateRates | null {
    return pricing[String(templateId)] ?? null;
  }

  // ── Quote ─────────────────────────────────────────────────────────────────

  async quoteVmCreation(
    templateId: number,
    cpuCores: number,
    memoryGb: number,
    diskGb: number,
    count: number,
    billingPeriod: 'monthly' | 'quarterly' | 'yearly' = 'monthly'
  ): Promise<AdminQuoteResult> {
    const { templatePricing } = await this.getPricing();
    const rates = this.getRatesForTemplate(templatePricing, templateId);

    if (!rates) {
      return {
        cpuCores, memoryGb, diskGb, billingPeriod,
        cpuCost: 0, ramCost: 0, diskCost: 0,
        subtotal: 0, discountPct: 0, total: 0,
        count, grandTotal: 0,
      };
    }

    const discounts = rates.billingDiscounts ?? { quarterly: 0, yearly: 0 };
    const cpuCost = cpuCores * rates.cpuRatePerCoreMonthly;
    const ramCost = memoryGb * rates.ramRatePerGbMonthly;
    const diskCost = diskGb * rates.diskRatePerGbMonthly;
    const monthlyTotal = (cpuCost + ramCost + diskCost) * count;
    const { multiplied: total, discountPct } = applyBillingMultiplier(monthlyTotal, billingPeriod, discounts);

    return {
      cpuCores, memoryGb, diskGb, billingPeriod,
      cpuCost, ramCost, diskCost,
      subtotal: monthlyTotal,
      discountPct,
      total: Math.round(total * 100) / 100,
      count,
      grandTotal: Math.round(total * 100) / 100,
    };
  }
}

export const adminBillingService = new AdminBillingService();
