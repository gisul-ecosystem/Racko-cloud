import mongoose, { Document, Schema } from 'mongoose';

export type NotificationType =
  | 'vm_job'
  | 'tenant_order'
  | 'vm_plan_expired'
  | 'catalog_vm_request'
  | 'dedicated_server_request';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  read: boolean;
  readAt?: Date;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'vm_job',
        'tenant_order',
        'vm_plan_expired',
        'catalog_vm_request',
        'dedicated_server_request',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    severity: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    actionUrl: {
      type: String,
      trim: true,
      maxlength: 300,
    },
  },
  {
    strict: true,
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, 'metadata.jobId': 1, 'metadata.event': 1 },
  { unique: true, sparse: true }
);
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
