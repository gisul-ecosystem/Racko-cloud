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

  // VM tracking — create jobs: successfully created VM ids; delete jobs: successfully deleted VM ids
  vmIds: mongoose.Types.ObjectId[];
  targetVmIds?: mongoose.Types.ObjectId[];
  failedVmids: number[];

  // Request details stored for reference
  requestedSpecs: {
    templateId: number;
    templateName: string;
    templateNode: string;
    cloneType: 'dedicated_storage' | 'dynamic_storage';
    cpuCores: number;
    memoryGb: number;
    diskGb: number;
    templateDiskGb: number;    // actual template disk size — used for resize calculation
    templateCpuCores: number;  // actual template CPU — used for config override check
    templateMemoryGb: number;  // actual template RAM — used for config override check
    namePrefix: string;
    count: number;
    consoleUsername: string;             // template's fixed cloud-init username
    passwordMode: 'fixed' | 'dynamic';
    consolePassword?: string;            // set when passwordMode === 'fixed'
    consoleProtocol: 'rdp' | 'ssh';
    enableVirtualization?: boolean;
    softwareIds?: mongoose.Types.ObjectId[];
  };

  // Golden-image bulk job progress (transient)
  phase?: 'building_golden_image' | 'cloning_vms';
  goldenTemplateVmid?: number;
  goldenTemplateNode?: string;

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
    targetVmIds: {
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
      templateNode: { type: String, required: true, trim: true },
      cloneType: {
        type: String,
        enum: ['dedicated_storage', 'dynamic_storage'],
        required: true,
      },
      cpuCores: { type: Number, required: true },
      memoryGb: { type: Number, required: true },
      diskGb: { type: Number, required: true },
      templateDiskGb: { type: Number, required: true },
      templateCpuCores: { type: Number, required: true },
      templateMemoryGb: { type: Number, required: true },
      namePrefix: { type: String, required: true },
      count: { type: Number, required: true },
      consoleUsername: { type: String, required: true },
      passwordMode: { type: String, enum: ['fixed', 'dynamic'], required: true },
      consolePassword: { type: String },
      consoleProtocol: { type: String, enum: ['rdp', 'ssh'], default: 'rdp' },
      enableVirtualization: { type: Boolean, default: false },
      softwareIds: { type: [Schema.Types.ObjectId], ref: 'Software', default: [] },
    },
    phase: {
      type: String,
      enum: ['building_golden_image', 'cloning_vms'],
    },
    goldenTemplateVmid: { type: Number },
    goldenTemplateNode: { type: String, trim: true },
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
