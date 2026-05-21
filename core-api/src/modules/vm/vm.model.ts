import mongoose, { Document, Schema } from 'mongoose';

export interface IVM extends Document {
  _id: mongoose.Types.ObjectId;

  // Proxmox identifiers
  vmid: number;
  node: string;

  // Ownership
  adminId: mongoose.Types.ObjectId;

  // VM details
  name: string;
  description?: string;
  templateId: number;
  templateName: string;
  cloneType: 'dedicated_storage' | 'dynamic_storage';

  // Allocated specs
  allocatedCpu: number;
  allocatedMemoryGb: number;
  allocatedDiskGb: number;

  // Current status
  status: 'creating' | 'running' | 'stopped' | 'paused' | 'suspended' | 'error' | 'deleting' | 'deleted';
  proxmoxStatus: string;

  // Network
  ipAddress?: string;
  macAddress?: string;

  // Job tracking
  jobId?: mongoose.Types.ObjectId;

  // HA slot
  haEnabled: boolean;
  // HA_SLOT: when cluster exists, this flag triggers HA enablement

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const vmSchema = new Schema<IVM>(
  {
    vmid: {
      type: Number,
      required: true,
    },
    node: {
      type: String,
      required: true,
      trim: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    templateId: {
      type: Number,
      required: true,
    },
    templateName: {
      type: String,
      required: true,
      trim: true,
    },
    cloneType: {
      type: String,
      enum: ['dedicated_storage', 'dynamic_storage'],
      required: true,
    },
    allocatedCpu: {
      type: Number,
      required: true,
    },
    allocatedMemoryGb: {
      type: Number,
      required: true,
    },
    allocatedDiskGb: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['creating', 'running', 'stopped', 'paused', 'suspended', 'error', 'deleting', 'deleted'],
      default: 'creating',
      required: true,
      index: true,
    },
    proxmoxStatus: {
      type: String,
      default: 'unknown',
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    macAddress: {
      type: String,
      trim: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'VMJob',
      index: true,
    },
    haEnabled: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
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

// Compound unique index: vmid + node (same VMID can exist on different nodes in theory,
// but Proxmox cluster VMIDs are globally unique — this enforces that at DB level too)
vmSchema.index({ vmid: 1, node: 1 }, { unique: true });

// Default query filter: never return deleted VMs in normal queries
vmSchema.pre(/^find/, function (this: mongoose.Query<unknown, IVM>, next) {
  // Only apply default filter if not explicitly querying for deleted
  const filter = this.getFilter() as Record<string, unknown>;
  if (!('status' in filter) && !('deletedAt' in filter)) {
    this.where({ status: { $ne: 'deleted' } });
  }
  next();
});

export const VM = mongoose.model<IVM>('VM', vmSchema);
