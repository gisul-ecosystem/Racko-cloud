import mongoose, { Document, Schema } from 'mongoose';

export type AdminWalletTransactionType = 'credit' | 'debit';

export interface IAdminWalletTransaction extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;          // super_admin who owns the wallet
  type: AdminWalletTransactionType;
  amount: number;
  reason: 'vm_creation' | 'manual_credit' | 'razorpay_topup' | 'refund';
  relatedVmJobId: string | null;            // vmApi createVM jobId
  creditedBy: mongoose.Types.ObjectId | null; // for manual credits — who credited
  balanceAfter: number;
  createdAt: Date;
}

const adminWalletTransactionSchema = new Schema<IAdminWalletTransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
      enum: ['vm_creation', 'manual_credit', 'razorpay_topup', 'refund'],
      required: true,
    },
    relatedVmJobId: {
      type: String,
      default: null,
    },
    creditedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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

adminWalletTransactionSchema.index({ userId: 1, createdAt: -1 });

export const AdminWalletTransaction = mongoose.model<IAdminWalletTransaction>(
  'AdminWalletTransaction',
  adminWalletTransactionSchema
);
