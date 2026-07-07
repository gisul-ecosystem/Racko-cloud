import mongoose, { Document, Schema } from 'mongoose';

export type ManualWalletPaymentMethod = 'upi' | 'bank_transfer' | 'cash' | 'other';

export interface IManualWalletCredit extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  paymentMethod: ManualWalletPaymentMethod;
  paymentReference: string;
  internalNote?: string;
  creditedBy: mongoose.Types.ObjectId;
  walletTransactionId: mongoose.Types.ObjectId;
  idempotencyKey?: string | null;
  createdAt: Date;
}

const manualWalletCreditSchema = new Schema<IManualWalletCredit>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
    },
    paymentMethod: {
      type: String,
      enum: ['upi', 'bank_transfer', 'cash', 'other'],
      required: true,
    },
    paymentReference: {
      type: String,
      required: true,
      trim: true,
      index: true,
      unique: true,
    },
    internalNote: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    creditedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    walletTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      required: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: null,
      sparse: true,
      unique: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

manualWalletCreditSchema.index({ tenantId: 1, createdAt: -1 });

export const ManualWalletCredit = mongoose.model<IManualWalletCredit>(
  'ManualWalletCredit',
  manualWalletCreditSchema
);
