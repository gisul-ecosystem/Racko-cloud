import mongoose, { Document, Schema } from 'mongoose';
import type { BillingPeriod } from '../../models/order.model';

export type SoftwareInstallStatus = 'pending' | 'installing' | 'installed' | 'failed';

export interface SoftwareInstall {
  softwareId: mongoose.Types.ObjectId;
  name: string;
  status: SoftwareInstallStatus;
  lastError?: string;
  installedAt?: Date;
  sweeperAttempts: number;
  cancelled: boolean;
}

export interface IVM extends Document {
  _id: mongoose.Types.ObjectId;

  // Proxmox identifiers
  vmid: number;
  node: string;

  // Ownership
  adminId: mongoose.Types.ObjectId;

  // Clone tracking
  isVmClone: boolean;
  sourceVmId?: mongoose.Types.ObjectId;
  sourceVmName?: string;

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
  status: 'creating' | 'running' | 'stopped' | 'paused' | 'suspended' | 'error' | 'deleting' | 'deleted' | 'delete_failed';
  proxmoxStatus: string;
  /** True after hibernate-to-disk — start API should resume, not cold boot */
  isHibernated: boolean;

  // Deletion tracking
  lastError?: string;
  deleteAttempts?: number;

  // Network
  ipAddress?: string;
  macAddress?: string;

  // Console access (Guacamole)
  consoleUsername?: string;
  consolePassword?: string;
  consoleProtocol: 'rdp' | 'ssh';
  consoleReady: boolean;   // true only after IP is resolved + cloudbase-init grace delay

  // Job tracking
  jobId?: mongoose.Types.ObjectId;

  // Tenant order plan (null = not provisioned via tenant order flow)
  tenantId?: mongoose.Types.ObjectId | null;
  orderId?: mongoose.Types.ObjectId | null;
  planPeriodEnd?: Date | null;
  planStatus?: 'active' | 'expired' | null;
  billingPeriod?: BillingPeriod | null;
  /** planPeriodEnd value a soon-expiry warning was already sent for */
  planExpiryWarningFor?: Date | null;

  // Assignment
  assignedTo?: mongoose.Types.ObjectId;

  // HA slot
  haEnabled: boolean;
  // HA_SLOT: when cluster exists, this flag triggers HA enablement

  // Nested virtualization (Hyper-V inside Windows guest)
  enableVirtualization: boolean;
  hyperVStatus: 'disabled' | 'pending' | 'enabling' | 'disabling' | 'enabled' | 'failed';
  hyperVLastError?: string;
  hyperVStatusChangedAt?: Date;
  hyperVAttemptCount: number;
  hyperVLockedUntil?: Date;
  hyperVPrePowerState?: 'running' | 'stopped';
  hyperVCancelled: boolean;

  // Software installation (Windows — Chocolatey)
  softwareInstalls: SoftwareInstall[];

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
    isVmClone: {
      type: Boolean,
      default: false,
      index: true,
    },
    sourceVmId: {
      type: Schema.Types.ObjectId,
      ref: 'VM',
      default: null,
    },
    sourceVmName: {
      type: String,
      trim: true,
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
      enum: ['creating', 'running', 'stopped', 'paused', 'suspended', 'error', 'deleting', 'deleted', 'delete_failed'],
      default: 'creating',
      required: true,
      index: true,
    },
    proxmoxStatus: {
      type: String,
      default: 'unknown',
    },
    isHibernated: {
      type: Boolean,
      default: false,
    },
    lastError: {
      type: String,
      trim: true,
    },
    deleteAttempts: {
      type: Number,
      default: 0,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    macAddress: {
      type: String,
      trim: true,
    },
    consoleUsername: {
      type: String,
      trim: true,
    },
    consolePassword: {
      type: String,
    },
    consoleProtocol: {
      type: String,
      enum: ['rdp', 'ssh'],
      default: 'rdp',
    },
    consoleReady: {
      type: Boolean,
      default: false,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'VMJob',
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    planPeriodEnd: {
      type: Date,
      default: null,
      index: true,
    },
    planStatus: {
      type: String,
      enum: ['active', 'expired'],
      default: null,
    },
    billingPeriod: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: null,
    },
    planExpiryWarningFor: {
      type: Date,
      default: null,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    haEnabled: {
      type: Boolean,
      default: false,
    },
    enableVirtualization: {
      type: Boolean,
      default: false,
    },
    hyperVStatus: {
      type: String,
      enum: ['disabled', 'pending', 'enabling', 'disabling', 'enabled', 'failed'],
      default: 'disabled',
    },
    hyperVLastError: {
      type: String,
      trim: true,
      default: '',
    },
    hyperVStatusChangedAt: {
      type: Date,
    },
    hyperVAttemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    hyperVLockedUntil: {
      type: Date,
    },
    hyperVPrePowerState: {
      type: String,
      enum: ['running', 'stopped'],
    },
    hyperVCancelled: {
      type: Boolean,
      default: false,
    },
    softwareInstalls: {
      type: [
        {
          softwareId: { type: Schema.Types.ObjectId, ref: 'Software', required: true },
          name: { type: String, required: true, trim: true },
          status: {
            type: String,
            enum: ['pending', 'installing', 'installed', 'failed'],
            default: 'pending',
          },
          lastError: { type: String, trim: true },
          installedAt: { type: Date },
          sweeperAttempts: { type: Number, default: 0 },
          cancelled: { type: Boolean, default: false },
        },
      ],
      default: [],
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

// Partial unique index: vmid + node, only for non-deleted VMs.
// Deleted and delete_failed VMs are excluded so their vmid can be reused.
vmSchema.index(
  { vmid: 1, node: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $nin: ['deleted', 'delete_failed'] } },
  }
);

// Supports the Hyper-V sweeper, which periodically scans for stuck in-flight
// jobs by status + status-change time (see hypervSweeper.ts).
vmSchema.index({ hyperVStatus: 1, hyperVStatusChangedAt: 1 });

// When a VM is soft-deleted, clear its assignedTo so no dangling references remain
vmSchema.pre('save', function (next) {
  if (this.isModified('status') && (this.status === 'deleted' || this.status === 'deleting')) {
    this.assignedTo = undefined;
  }
  next();
});

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
