import mongoose, { Document, Schema } from 'mongoose';

export type WalletTransactionType = 'credit' | 'debit';

export type WalletTransactionSource = 'razorpay' | 'manual' | 'system';

export interface IWalletTransaction extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  type: WalletTransactionType;
  amount: number;
  reason: string;
  source: WalletTransactionSource;
  externalReference: string | null;
  createdBy: mongoose.Types.ObjectId | null;
  idempotencyKey: string | null;
  relatedOrderId: mongoose.Types.ObjectId | null;
  relatedVmId: mongoose.Types.ObjectId | null;
  balanceAfter: number;
  createdAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      enum: ['razorpay', 'manual', 'system'],
      default: 'system',
      required: true,
    },
    externalReference: {
      type: String,
      default: null,
      trim: true,
      sparse: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
      sparse: true,
    },
    relatedOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    relatedVmId: {
      type: Schema.Types.ObjectId,
      ref: 'VM',
      default: null,
      index: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

walletTransactionSchema.index({ tenantId: 1, createdAt: -1 });
walletTransactionSchema.index(
  { externalReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalReference: { $type: 'string' },
      source: { $in: ['razorpay', 'manual'] },
    },
  }
);

export const WalletTransaction = mongoose.model<IWalletTransaction>(
  'WalletTransaction',
  walletTransactionSchema
);
