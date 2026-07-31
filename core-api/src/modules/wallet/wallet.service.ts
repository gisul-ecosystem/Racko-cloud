import mongoose from 'mongoose';
import { Wallet } from '../../models/wallet.model';
import {
  WalletTransaction,
  type WalletTransactionSource,
} from '../../models/walletTransaction.model';
import { AppError } from '../../utils/errors';

export interface CreditWalletOptions {
  relatedOrderId?: string | null;
  relatedVmId?: string | null;
  source?: WalletTransactionSource;
  externalReference?: string | null;
  createdBy?: mongoose.Types.ObjectId | string | null;
  idempotencyKey?: string | null;
  session?: mongoose.ClientSession | null;
}

export interface CreditWalletResult {
  balance: number;
  currency: string;
  transactionId: string;
}

export class WalletService {
  async getOrCreateWallet(
    tenantId: string
  ): Promise<{ balance: number; currency: string; usdToInrRate: number }> {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const wallet = await Wallet.findOneAndUpdate(
      { tenantId: tenantObjectId },
      {
        $setOnInsert: { tenantId: tenantObjectId, balance: 0, currency: 'INR' },
      },
      { upsert: true, new: true }
    );

    return {
      balance: wallet.balance,
      currency: wallet.currency,
      usdToInrRate: this.getUsdToInrRate(),
    };
  }

  getUsdToInrRate(): number {
    const configured = Number(process.env.USD_TO_INR_RATE);
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return 86;
  }

  usdToInr(amountUsd: number): number {
    const converted = amountUsd * this.getUsdToInrRate();
    return Math.round(converted * 100) / 100;
  }

  async getBalance(tenantId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(tenantId);
    return wallet.balance;
  }

  async creditWallet(
    tenantId: string,
    amount: number,
    reason: string,
    options: CreditWalletOptions = {}
  ): Promise<CreditWalletResult> {
    if (amount <= 0) {
      throw new AppError('Amount must be positive.', 400, 'VALIDATION_ERROR');
    }

    const {
      relatedOrderId = null,
      relatedVmId = null,
      source = 'system',
      externalReference = null,
      createdBy = null,
      idempotencyKey = null,
      session = null,
    } = options;

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const createdById =
      createdBy == null
        ? null
        : createdBy instanceof mongoose.Types.ObjectId
          ? createdBy
          : new mongoose.Types.ObjectId(createdBy);

    const wallet = await Wallet.findOneAndUpdate(
      { tenantId: tenantObjectId },
      {
        $inc: { balance: amount },
        $setOnInsert: { tenantId: tenantObjectId, currency: 'INR' },
      },
      { upsert: true, new: true, session: session ?? undefined }
    );

    if (!wallet) {
      throw new AppError('Failed to update wallet.', 500, 'INTERNAL_ERROR');
    }

    const [transaction] = await WalletTransaction.create(
      [
        {
          tenantId: tenantObjectId,
          type: 'credit',
          amount,
          reason,
          source,
          externalReference,
          createdBy: createdById,
          idempotencyKey,
          relatedOrderId: relatedOrderId ? new mongoose.Types.ObjectId(relatedOrderId) : null,
          relatedVmId: relatedVmId ? new mongoose.Types.ObjectId(relatedVmId) : null,
          balanceAfter: wallet.balance,
        },
      ],
      { session: session ?? undefined }
    );

    return {
      balance: wallet.balance,
      currency: wallet.currency,
      transactionId: transaction._id.toString(),
    };
  }

  async debitWallet(
    tenantId: string,
    amount: number,
    reason: string,
    relatedOrderId: string | null = null,
    relatedVmId: string | null = null,
    externalReference: string | null = null,
    attribution?: {
      projectId?: string | null;
      serviceKey?: string | null;
    }
  ): Promise<{ balance: number; currency: string }> {
    if (amount <= 0) {
      throw new AppError('Amount must be positive.', 400, 'VALIDATION_ERROR');
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const wallet = await Wallet.findOneAndUpdate(
      { tenantId: tenantObjectId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );

    if (!wallet) {
      throw new AppError('INSUFFICIENT_BALANCE', 402, 'INSUFFICIENT_BALANCE');
    }

    await WalletTransaction.create({
      tenantId: tenantObjectId,
      type: 'debit',
      amount,
      reason,
      source: 'system',
      externalReference,
      relatedOrderId: relatedOrderId ? new mongoose.Types.ObjectId(relatedOrderId) : null,
      relatedVmId: relatedVmId ? new mongoose.Types.ObjectId(relatedVmId) : null,
      projectId:
        attribution?.projectId && mongoose.Types.ObjectId.isValid(attribution.projectId)
          ? new mongoose.Types.ObjectId(attribution.projectId)
          : null,
      serviceKey: attribution?.serviceKey ?? null,
      balanceAfter: wallet.balance,
    });

    return { balance: wallet.balance, currency: wallet.currency };
  }

  async chargeCloudRequest(
    tenantId: string,
    amountUsd: number,
    relatedRequestId: string | null = null,
    provider: 'azure' | 'aws' = 'azure'
  ): Promise<{
    balance: number;
    currency: string;
    chargedInr: number;
    amountUsd: number;
    usdToInrRate: number;
    provider: 'azure' | 'aws';
  }> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new AppError('Estimated amount must be a positive number.', 400, 'VALIDATION_ERROR');
    }

    const usdToInrRate = this.getUsdToInrRate();
    const chargedInr = this.usdToInr(amountUsd);
    const reason = provider === 'aws' ? 'aws_lab_request' : 'azure_lab_request';
    const externalReference = relatedRequestId
      ? `cloud_request:${provider}:${relatedRequestId}`
      : null;
    const wallet = await this.debitWallet(
      tenantId,
      chargedInr,
      reason,
      null,
      null,
      externalReference
    );

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
    tenantId: string,
    amountInr: number,
    relatedRequestId: string | null = null,
    provider: 'azure' | 'aws' = 'azure'
  ): Promise<{ balance: number; currency: string }> {
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      throw new AppError('Refund amount must be a positive number.', 400, 'VALIDATION_ERROR');
    }

    const reason = provider === 'aws' ? 'aws_lab_request_refund' : 'azure_lab_request_refund';
    return this.creditWallet(tenantId, amountInr, reason, {
      externalReference: relatedRequestId
        ? `cloud_request_refund:${provider}:${relatedRequestId}`
        : null,
    });
  }

  async linkCloudRequestCharge(
    tenantId: string,
    relatedRequestId: string,
    provider: 'azure' | 'aws' = 'azure'
  ): Promise<void> {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const reason = provider === 'aws' ? 'aws_lab_request' : 'azure_lab_request';
    await WalletTransaction.findOneAndUpdate(
      {
        tenantId: tenantObjectId,
        type: 'debit',
        reason,
        $or: [{ externalReference: null }, { externalReference: { $exists: false } }],
      },
      { $set: { externalReference: `cloud_request:${provider}:${relatedRequestId}` } },
      { sort: { createdAt: -1 } }
    );
  }

  async listTransactions(
    tenantId: string,
    page = 1,
    limit = 20
  ): Promise<{
    transactions: Array<{
      id: string;
      type: string;
      amount: number;
      reason: string;
      source: WalletTransactionSource;
      externalReference: string | null;
      relatedOrderId: string | null;
      relatedVmId: string | null;
      balanceAfter: number;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await Promise.all([
      WalletTransaction.find({ tenantId: tenantObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      WalletTransaction.countDocuments({ tenantId: tenantObjectId }),
    ]);

    return {
      transactions: rows.map((row) => ({
        id: row._id.toString(),
        type: row.type,
        amount: row.amount,
        reason: row.reason,
        source: row.source ?? 'system',
        externalReference: row.externalReference ?? null,
        relatedOrderId: row.relatedOrderId ? row.relatedOrderId.toString() : null,
        relatedVmId: row.relatedVmId ? row.relatedVmId.toString() : null,
        balanceAfter: row.balanceAfter,
        createdAt: row.createdAt,
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }
}

export const walletService = new WalletService();
