import mongoose, { Document, Schema } from 'mongoose';

export type TenantNotificationType = 'vm_plan_expiring_soon';

export interface ITenantNotification extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  type: TenantNotificationType;
  title: string;
  message: string;
  severity: 'info' | 'warning';
  read: boolean;
  readAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const tenantNotificationSchema = new Schema<ITenantNotification>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    tenantUserId: {
      type: Schema.Types.ObjectId,
      ref: 'TenantUser',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['vm_plan_expiring_soon'],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    severity: {
      type: String,
      enum: ['info', 'warning'],
      default: 'warning',
      required: true,
    },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

tenantNotificationSchema.index({ tenantUserId: 1, read: 1, createdAt: -1 });
tenantNotificationSchema.index(
  { tenantId: 1, 'metadata.vmId': 1, 'metadata.planPeriodEnd': 1, type: 1 },
  { unique: true, sparse: true }
);

export const TenantNotification = mongoose.model<ITenantNotification>(
  'TenantNotification',
  tenantNotificationSchema
);
