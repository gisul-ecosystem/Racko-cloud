import mongoose, { Document, Schema } from 'mongoose';

export interface INodeAlert extends Document {
  _id: mongoose.Types.ObjectId;

  node: string;
  resource: 'cpu' | 'ram' | 'storage';
  severity: 'warning' | 'critical' | 'full';

  currentPercent: number;
  thresholdPercent: number;

  status: 'active' | 'resolved';

  // Storage specific
  storagePool?: string;

  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const nodeAlertSchema = new Schema<INodeAlert>(
  {
    node: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    resource: {
      type: String,
      enum: ['cpu', 'ram', 'storage'],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['warning', 'critical', 'full'],
      required: true,
    },
    currentPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    thresholdPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ['active', 'resolved'],
      default: 'active',
      required: true,
      index: true,
    },
    storagePool: {
      type: String,
      trim: true,
    },
    resolvedAt: {
      type: Date,
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

// Compound index for efficient alert lookup (node + resource + status)
nodeAlertSchema.index({ node: 1, resource: 1, status: 1 });
nodeAlertSchema.index({ createdAt: -1 });

export const NodeAlert = mongoose.model<INodeAlert>('NodeAlert', nodeAlertSchema);
