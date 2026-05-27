import mongoose, { Document, Schema } from 'mongoose';

export type VMEventType =
  | 'VM_CREATED'
  | 'VM_DELETED'
  | 'VM_STARTED'
  | 'VM_STOPPED'
  | 'VM_FORCE_STOPPED'
  | 'VM_RESTARTED'
  | 'VM_RESET'
  | 'VM_SUSPENDED'
  | 'VM_RESUMED'
  | 'VM_CONSOLE_OPENED'
  | 'VM_CREATION_FAILED'
  | 'VM_OPERATION_FAILED';

export interface IVMEvent extends Document {
  _id: mongoose.Types.ObjectId;

  vmId: mongoose.Types.ObjectId;
  vmid: number;
  adminId: mongoose.Types.ObjectId;

  event: VMEventType;
  status: 'success' | 'failed';

  details?: Record<string, unknown>;
  errorMessage?: string;

  ipAddress: string;
  userAgent: string;

  createdAt: Date;
}

const vmEventSchema = new Schema<IVMEvent>(
  {
    vmId: {
      type: Schema.Types.ObjectId,
      ref: 'VM',
      required: true,
      index: true,
    },
    vmid: {
      type: Number,
      required: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    event: {
      type: String,
      enum: [
        'VM_CREATED',
        'VM_DELETED',
        'VM_STARTED',
        'VM_STOPPED',
        'VM_FORCE_STOPPED',
        'VM_RESTARTED',
        'VM_RESET',
        'VM_SUSPENDED',
        'VM_RESUMED',
        'VM_CONSOLE_OPENED',
        'VM_CREATION_FAILED',
        'VM_OPERATION_FAILED',
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      required: true,
    },
    details: {
      type: Schema.Types.Mixed,
    },
    errorMessage: {
      type: String,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
  },
  {
    strict: true,
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// TTL: keep events for 90 days
vmEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const VMEvent = mongoose.model<IVMEvent>('VMEvent', vmEventSchema);
