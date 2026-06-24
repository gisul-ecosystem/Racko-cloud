import mongoose, { Document, Schema } from 'mongoose';

export type WalletTransactionType = 'credit' | 'debit';

export interface IWalletTransaction extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  type: WalletTransactionType;
  amount: number;
  reason: string;
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

export const WalletTransaction = mongoose.model<IWalletTransaction>(
  'WalletTransaction',
  walletTransactionSchema
);
