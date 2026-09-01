import mongoose, { Document, Schema } from 'mongoose';
import type { WeeklyScheduleDay } from '../vmAccessSchedule/weeklySchedule';

export type ExternalVMProtocol = 'rdp' | 'ssh' | 'vnc';

/** Billing / provenance: which console imported this elastic server. */
export type ExternalVMSource = 'admin_import' | 'tenant_import' | 'superadmin_bulk';

export interface IExternalVM extends Document {
  _id: mongoose.Types.ObjectId;

  // Connection details
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  /** Optional override; defaults to 3389/22/5900 by protocol when opening console. */
  port?: number;
  username: string;
  /** AES-256-CBC encrypted password (encrypt/decrypt handled in the service). */
  password: string;

  /**
   * Where this VM record originated (billing attribution).
   * Set explicitly on each create path; backfilled by migrateExternalVmSource.
   */
  source: ExternalVMSource;

  /** Platform admin owner (admin console). Mutually exclusive with tenantId. Omit both for free-pool VMs. */
  adminId?: mongoose.Types.ObjectId;
  /** Tenant workspace owner (tenant console). Mutually exclusive with adminId. Omit both for free-pool VMs. */
  tenantId?: mongoose.Types.ObjectId;
  /** Organization project this elastic server belongs to (platform admin). */
  projectId?: mongoose.Types.ObjectId;
  /** Tenant user who created the record (optional audit). */
  createdByTenantUserId?: mongoose.Types.ObjectId;

  /** Platform managed user this server is assigned to (admin console). */
  assignedTo?: mongoose.Types.ObjectId;
  /** Tenant end-user this server is assigned to (tenant console). */
  assignedTenantUserId?: mongoose.Types.ObjectId;

  // Per-resource access schedule (same contract as platform VMs)
  accessStartDate?: Date | null;
  accessEndDate?: Date | null;
  accessStartTime?: string | null;
  accessEndTime?: string | null;
  accessOverride: boolean;
  accessOverrideUntil?: Date | null;
  weeklySchedule?: WeeklyScheduleDay[] | null;
  weeklyScheduleTz: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/** Default stored username per protocol when one is not supplied at import/create. */
export function defaultUsernameFor(protocol: ExternalVMProtocol): string {
  if (protocol === 'ssh') return 'root';
  if (protocol === 'vnc') return 'admin';
  return 'Administrator';
}

/** Default Guacamole port when `port` is not stored on the VM document. */
export function defaultPortForExternalVm(
  protocol: ExternalVMProtocol,
  port?: number | null
): number {
  if (port != null && port > 0) return port;
  switch (protocol) {
    case 'rdp':
      return 3389;
    case 'vnc':
      return 5900;
    case 'ssh':
      return 22;
  }
}

const externalVMSchema = new Schema<IExternalVM>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ipAddress: {
      type: String,
      required: true,
      trim: true,
    },
    protocol: {
      type: String,
      enum: ['rdp', 'ssh', 'vnc'],
      required: true,
    },
    port: {
      type: Number,
      min: 1,
      max: 65535,
      required: false,
    },
    username: {
      type: String,
      trim: true,
      default: undefined,
    },
    password: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ['admin_import', 'tenant_import', 'superadmin_bulk'],
      required: true,
      index: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: false,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: false,
      index: true,
    },
    createdByTenantUserId: {
      type: Schema.Types.ObjectId,
      ref: 'TenantUser',
      required: false,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    assignedTenantUserId: {
      type: Schema.Types.ObjectId,
      ref: 'TenantUser',
      index: true,
      default: null,
    },
    accessStartDate: { type: Date, default: null },
    accessEndDate: { type: Date, default: null },
    accessStartTime: { type: String, default: null, trim: true },
    accessEndTime: { type: String, default: null, trim: true },
    accessOverride: { type: Boolean, default: false, index: true },
    accessOverrideUntil: { type: Date, default: null },
    weeklySchedule: { type: Schema.Types.Mixed, default: null },
    weeklyScheduleTz: { type: String, default: 'Asia/Kolkata', trim: true },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    strict: true,
    timestamps: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

externalVMSchema.index({ tenantId: 1, createdAt: -1 });

externalVMSchema.pre('validate', function (next) {
  if (!this.username?.trim()) {
    this.username = defaultUsernameFor(this.protocol);
  }
  const hasAdmin = Boolean(this.adminId);
  const hasTenant = Boolean(this.tenantId);
  if (hasAdmin && hasTenant) {
    next(new Error('External VM cannot belong to both adminId and tenantId.'));
    return;
  }
  next();
});

externalVMSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const ExternalVMModel = mongoose.model<IExternalVM>('ExternalVM', externalVMSchema);
