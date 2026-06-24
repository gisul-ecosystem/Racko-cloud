import mongoose from 'mongoose';
import { Wallet } from '../../models/wallet.model';
import { WalletTransaction } from '../../models/walletTransaction.model';
import { AppError } from '../../utils/errors';

export class WalletService {
  async getOrCreateWallet(tenantId: string): Promise<{ balance: number; currency: string }> {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const wallet = await Wallet.findOneAndUpdate(
      { tenantId: tenantObjectId },
      {
        $setOnInsert: { tenantId: tenantObjectId, balance: 0, currency: 'INR' },
      },
      { upsert: true, new: true }
    );

    return { balance: wallet.balance, currency: wallet.currency };
  }

  async getBalance(tenantId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(tenantId);
    return wallet.balance;
  }

  async creditWallet(
    tenantId: string,
    amount: number,
    reason: string,
    relatedOrderId: string | null = null
  ): Promise<{ balance: number; currency: string }> {
    if (amount <= 0) {
      throw new AppError('Amount must be positive.', 400, 'VALIDATION_ERROR');
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const wallet = await Wallet.findOneAndUpdate(
      { tenantId: tenantObjectId },
      {
        $inc: { balance: amount },
        $setOnInsert: { tenantId: tenantObjectId, currency: 'INR' },
      },
      { upsert: true, new: true }
    );

    await WalletTransaction.create({
      tenantId: tenantObjectId,
      type: 'credit',
      amount,
      reason,
      relatedOrderId: relatedOrderId ? new mongoose.Types.ObjectId(relatedOrderId) : null,
      balanceAfter: wallet.balance,
    });

    return { balance: wallet.balance, currency: wallet.currency };
  }

  async debitWallet(
    tenantId: string,
    amount: number,
    reason: string,
    relatedOrderId: string | null = null,
    relatedVmId: string | null = null
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
      relatedOrderId: relatedOrderId ? new mongoose.Types.ObjectId(relatedOrderId) : null,
      relatedVmId: relatedVmId ? new mongoose.Types.ObjectId(relatedVmId) : null,
      balanceAfter: wallet.balance,
    });

    return { balance: wallet.balance, currency: wallet.currency };
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
