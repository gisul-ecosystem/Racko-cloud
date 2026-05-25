import mongoose, { Document, Schema } from 'mongoose';

export interface IVMJob extends Document {
  _id: mongoose.Types.ObjectId;

  adminId: mongoose.Types.ObjectId;
  type: 'single_create' | 'bulk_create' | 'bulk_delete' | 'bulk_start' | 'bulk_stop';

  // Job progress
  status: 'pending' | 'processing' | 'completed' | 'partial' | 'failed';
  total: number;
  completed: number;
  failed: number;
  pending: number;

  // VM tracking
  vmIds: mongoose.Types.ObjectId[];
  failedVmids: number[];

  // Request details stored for reference
  requestedSpecs: {
    templateId: number;
    templateName: string;
    cloneType: 'dedicated_storage' | 'dynamic_storage';
    cpuCores: number;
    memoryGb: number;
    diskGb: number;
    templateDiskGb: number;  // actual template disk size — used for resize calculation
    namePrefix: string;
    count: number;
  };

  // Error details
  jobErrors: Array<{
    index: number;
    vmName: string;
    error: string;
    node?: string;
  }>;

  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const vmJobSchema = new Schema<IVMJob>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['single_create', 'bulk_create', 'bulk_delete', 'bulk_start', 'bulk_stop'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'partial', 'failed'],
      default: 'pending',
      required: true,
      index: true,
    },
    total: {
      type: Number,
      required: true,
      min: 1,
    },
    completed: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },
    pending: {
      type: Number,
      required: true,
    },
    vmIds: {
      type: [Schema.Types.ObjectId],
      ref: 'VM',
      default: [],
    },
    failedVmids: {
      type: [Number],
      default: [],
    },
    requestedSpecs: {
      templateId: { type: Number, required: true },
      templateName: { type: String, required: true },
      cloneType: {
        type: String,
        enum: ['dedicated_storage', 'dynamic_storage'],
        required: true,
      },
      cpuCores: { type: Number, required: true },
      memoryGb: { type: Number, required: true },
      diskGb: { type: Number, required: true },
      templateDiskGb: { type: Number, required: true },
      namePrefix: { type: String, required: true },
      count: { type: Number, required: true },
    },
    jobErrors: {
      type: [
        {
          index: { type: Number, required: true },
          vmName: { type: String, required: true },
          error: { type: String, required: true },
          node: { type: String },
        },
      ],
      default: [],
    },
    startedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    completedAt: {
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

// TTL: keep jobs for 30 days
vmJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const VMJob = mongoose.model<IVMJob>('VMJob', vmJobSchema);
