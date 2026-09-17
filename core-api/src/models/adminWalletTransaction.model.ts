import mongoose, { Document, Schema } from 'mongoose';

export type AdminWalletTransactionType = 'credit' | 'debit';

export interface IAdminWalletTransaction extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;          // wallet owner
  type: AdminWalletTransactionType;
  amount: number;
  reason:
    | 'vm_creation'
    | 'azure_lab_request'
    | 'aws_lab_request'
    | 'gcp_lab_request'
    | 'catalog_vm_purchase'
    | 'dedicated_server_purchase'
    | 'manual_credit'
    | 'razorpay_topup'
    | 'refund';
  relatedVmJobId: string | null;            // vm jobId / cloud request id
  /** Organization owner userId for project cost attribution. */
  orgId: mongoose.Types.ObjectId | null;
  /** Project this charge belongs to (optional for legacy rows). */
  projectId: mongoose.Types.ObjectId | null;
  /** Admin service key for service-level reports. */
  serviceKey: string | null;
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
      enum: [
        'vm_creation',
        'azure_lab_request',
        'aws_lab_request',
        'gcp_lab_request',
        'catalog_vm_purchase',
        'dedicated_server_purchase',
        'manual_credit',
        'razorpay_topup',
        'refund',
      ],
      required: true,
    },
    relatedVmJobId: {
      type: String,
      default: null,
    },
    orgId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    serviceKey: {
      type: String,
      default: null,
      index: true,
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
adminWalletTransactionSchema.index({ orgId: 1, projectId: 1, createdAt: -1 });
adminWalletTransactionSchema.index({ orgId: 1, serviceKey: 1, createdAt: -1 });

export const AdminWalletTransaction = mongoose.model<IAdminWalletTransaction>(
  'AdminWalletTransaction',
  adminWalletTransactionSchema
);
