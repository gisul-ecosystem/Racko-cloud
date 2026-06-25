import mongoose from 'mongoose';
import { config } from '../../config';
import { AuditLog } from '../../models/auditLog.model';
import {
  ManualWalletCredit,
  type ManualWalletPaymentMethod,
} from '../../models/manualWalletCredit.model';
import { Tenant } from '../../models/tenant.model';
import { isValidObjectId } from '../tenant/tenant.service';
import { walletService } from './wallet.service';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';

export interface ManualWalletCreditInput {
  amount: number;
  paymentReference: string;
  paymentMethod: ManualWalletPaymentMethod;
  internalNote?: string;
}

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: number }).code === 11000
  );
}

function normalizePaymentReference(value: string): string {
  return value.trim().toUpperCase();
}

function toManualCreditPublic(doc: {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  paymentMethod: ManualWalletPaymentMethod;
  paymentReference: string;
  internalNote?: string;
  creditedBy: mongoose.Types.ObjectId;
  walletTransactionId: mongoose.Types.ObjectId;
  createdAt: Date;
}) {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId.toString(),
    amount: doc.amount,
    currency: doc.currency,
    paymentMethod: doc.paymentMethod,
    paymentReference: doc.paymentReference,
    internalNote: doc.internalNote ?? null,
    creditedBy: doc.creditedBy.toString(),
    walletTransactionId: doc.walletTransactionId.toString(),
    createdAt: doc.createdAt,
  };
}

async function assertTenantEligibleForWallet(tenantId: string) {
  if (!isValidObjectId(tenantId)) {
    throw new NotFoundError('Tenant not found.');
  }

  const tenant = await Tenant.findById(tenantId).select('status').lean();
  if (!tenant) {
    throw new NotFoundError('Tenant not found.');
  }

  if (tenant.status !== 'active') {
    throw new ValidationError('Wallet operations are only allowed for active tenants.');
  }
}

export class SuperAdminWalletService {
  async getWallet(tenantId: string) {
    await assertTenantEligibleForWallet(tenantId);
    return walletService.getOrCreateWallet(tenantId);
  }

  async listTransactions(tenantId: string, page = 1, limit = 20) {
    await assertTenantEligibleForWallet(tenantId);
    return walletService.listTransactions(tenantId, page, limit);
  }

  async listManualCredits(tenantId: string, page = 1, limit = 20) {
    await assertTenantEligibleForWallet(tenantId);

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const [rows, total] = await Promise.all([
      ManualWalletCredit.find({ tenantId: tenantObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      ManualWalletCredit.countDocuments({ tenantId: tenantObjectId }),
    ]);

    return {
      credits: rows.map((row) =>
        toManualCreditPublic({
          _id: row._id,
          tenantId: row.tenantId,
          amount: row.amount,
          currency: row.currency,
          paymentMethod: row.paymentMethod,
          paymentReference: row.paymentReference,
          internalNote: row.internalNote,
          creditedBy: row.creditedBy,
          walletTransactionId: row.walletTransactionId,
          createdAt: row.createdAt,
        })
      ),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async manualCredit(
    tenantId: string,
    superAdminUserId: string,
    input: ManualWalletCreditInput,
    audit: { ipAddress: string; userAgent: string; deviceFingerprint: string },
    idempotencyKey?: string | null
  ) {
    await assertTenantEligibleForWallet(tenantId);

    const amount = input.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('Amount must be positive.');
    }

    if (amount > config.MANUAL_TOPUP_MAX_AMOUNT) {
      throw new ValidationError(
        `Amount exceeds maximum allowed manual credit of ${config.MANUAL_TOPUP_MAX_AMOUNT}.`
      );
    }

    const paymentReference = normalizePaymentReference(input.paymentReference);
    if (paymentReference.length < 6 || paymentReference.length > 64) {
      throw new ValidationError('Payment reference must be between 6 and 64 characters.');
    }

    if (!/^[A-Z0-9][A-Z0-9/_\-:.]*$/.test(paymentReference)) {
      throw new ValidationError('Payment reference contains invalid characters.');
    }

    const trimmedKey = idempotencyKey?.trim() || null;
    if (trimmedKey) {
      const existingByKey = await ManualWalletCredit.findOne({ idempotencyKey: trimmedKey }).lean();
      if (existingByKey) {
        if (existingByKey.tenantId.toString() !== tenantId) {
          throw new ConflictError('Idempotency key already used for a different tenant.');
        }

        const wallet = await walletService.getOrCreateWallet(tenantId);
        return {
          credit: toManualCreditPublic(existingByKey),
          wallet,
          idempotentReplay: true,
        };
      }
    }

    const existingByReference = await ManualWalletCredit.findOne({ paymentReference }).lean();
    if (existingByReference) {
      throw new ConflictError('This payment reference has already been credited.');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const creditResult = await walletService.creditWallet(
        tenantId,
        amount,
        'topup_manual',
        {
          source: 'manual',
          externalReference: paymentReference,
          createdBy: superAdminUserId,
          idempotencyKey: trimmedKey,
          session,
        }
      );

      const [manualCredit] = await ManualWalletCredit.create(
        [
          {
            tenantId: new mongoose.Types.ObjectId(tenantId),
            amount,
            currency: 'INR',
            paymentMethod: input.paymentMethod,
            paymentReference,
            internalNote: input.internalNote?.trim() || undefined,
            creditedBy: new mongoose.Types.ObjectId(superAdminUserId),
            walletTransactionId: new mongoose.Types.ObjectId(creditResult.transactionId),
            idempotencyKey: trimmedKey,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      await AuditLog.create({
        userId: new mongoose.Types.ObjectId(superAdminUserId),
        event: 'WALLET_MANUAL_CREDIT',
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
        deviceFingerprint: audit.deviceFingerprint,
        metadata: {
          tenantId,
          manualCreditId: manualCredit._id.toString(),
          walletTransactionId: creditResult.transactionId,
          amount,
          paymentReference,
          paymentMethod: input.paymentMethod,
        },
      });

      return {
        credit: toManualCreditPublic(manualCredit),
        wallet: {
          balance: creditResult.balance,
          currency: creditResult.currency,
        },
        idempotentReplay: false,
      };
    } catch (error) {
      await session.abortTransaction();

      if (isMongoDuplicateKeyError(error)) {
        const replay =
          (trimmedKey
            ? await ManualWalletCredit.findOne({ idempotencyKey: trimmedKey }).lean()
            : null) ??
          (await ManualWalletCredit.findOne({ paymentReference }).lean());

        if (replay && replay.tenantId.toString() === tenantId) {
          const wallet = await walletService.getOrCreateWallet(tenantId);
          return {
            credit: toManualCreditPublic(replay),
            wallet,
            idempotentReplay: true,
          };
        }

        throw new ConflictError('This payment reference has already been credited.');
      }

      throw error;
    } finally {
      session.endSession();
    }
  }
}

export const superAdminWalletService = new SuperAdminWalletService();
