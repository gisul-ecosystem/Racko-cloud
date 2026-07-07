import mongoose from 'mongoose';
import { AdminWallet } from '../../models/adminWallet.model';
import { AdminWalletTransaction } from '../../models/adminWalletTransaction.model';
import { AdminPricingConfig, type TemplateRates } from '../../models/adminPricingConfig.model';
import { AppError, ValidationError } from '../../utils/errors';

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

  async getOrCreateWallet(userId: string): Promise<AdminWalletPublic> {
    const oid = new mongoose.Types.ObjectId(userId);
    const wallet = await AdminWallet.findOneAndUpdate(
      { userId: oid },
      { $setOnInsert: { userId: oid, balance: 0, currency: 'INR' } },
      { upsert: true, new: true }
    );
    return { balance: wallet.balance, currency: wallet.currency };
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  async creditWallet(
    userId: string,
    amount: number,
    creditedBy: string
  ): Promise<AdminWalletPublic> {
    if (amount <= 0) throw new ValidationError('Amount must be positive.');
    const oid = new mongoose.Types.ObjectId(userId);

    const wallet = await AdminWallet.findOneAndUpdate(
      { userId: oid },
      {
        $inc: { balance: amount },
        $setOnInsert: { userId: oid, currency: 'INR' },
      },
      { upsert: true, new: true }
    );
    if (!wallet) throw new AppError('Failed to update wallet.', 500, 'INTERNAL_ERROR');

    await AdminWalletTransaction.create({
      userId: oid,
      type: 'credit',
      amount,
      reason: 'manual_credit',
      relatedVmJobId: null,
      creditedBy: new mongoose.Types.ObjectId(creditedBy),
      balanceAfter: wallet.balance,
    });

    return { balance: wallet.balance, currency: wallet.currency };
  }

  async debitWallet(
    userId: string,
    amount: number,
    relatedVmJobId: string | null = null
  ): Promise<AdminWalletPublic> {
    if (amount <= 0) throw new ValidationError('Amount must be positive.');
    const oid = new mongoose.Types.ObjectId(userId);

    const wallet = await AdminWallet.findOneAndUpdate(
      { userId: oid, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );

    if (!wallet) {
      throw new AppError('INSUFFICIENT_BALANCE', 402, 'INSUFFICIENT_BALANCE');
    }

    await AdminWalletTransaction.create({
      userId: oid,
      type: 'debit',
      amount,
      reason: 'vm_creation',
      relatedVmJobId,
      creditedBy: null,
      balanceAfter: wallet.balance,
    });

    return { balance: wallet.balance, currency: wallet.currency };
  }

  async listTransactions(
    userId: string,
    page = 1,
    limit = 20
  ): Promise<{ transactions: AdminWalletTransactionPublic[]; total: number; page: number; limit: number }> {
    const oid = new mongoose.Types.ObjectId(userId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await Promise.all([
      AdminWalletTransaction.find({ userId: oid })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      AdminWalletTransaction.countDocuments({ userId: oid }),
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
        createdAt: r.createdAt,
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  // ── Pricing ───────────────────────────────────────────────────────────────

  async getPricing(): Promise<AdminPricingPublic> {
    const doc = await AdminPricingConfig.findOne().lean();
    if (!doc) {
      return { templatePricing: {}, updatedBy: null, updatedAt: null };
    }
    // Mongoose Map serialises to plain object via toObject — lean() gives a POJO map
    const raw = doc.templatePricing as unknown as Record<string, TemplateRates> | Map<string, TemplateRates>;
    const pricing: Record<string, TemplateRates> =
      raw instanceof Map
        ? Object.fromEntries(raw.entries())
        : (raw ?? {});

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
      {
        $set: {
          templatePricing,
          updatedBy: new mongoose.Types.ObjectId(updatedBy),
        },
      },
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
      // Return a zero-cost quote — pricing not configured yet
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
    const monthlyPerVm = cpuCost + ramCost + diskCost;
    const monthlyTotal = monthlyPerVm * count;

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
