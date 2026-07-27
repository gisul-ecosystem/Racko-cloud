import mongoose, { Document, Schema } from 'mongoose';
import type { WeeklyScheduleDay } from '../vmAccessSchedule/weeklySchedule';

export type ExternalVMProtocol = 'rdp' | 'ssh';

export interface IExternalVM extends Document {
  _id: mongoose.Types.ObjectId;

  // Connection details
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  username: string;
  /** AES-256-CBC encrypted password (encrypt/decrypt handled in the service). */
  password: string;

  /** Platform admin owner (admin console). Mutually exclusive with tenantId. */
  adminId?: mongoose.Types.ObjectId;
  /** Tenant workspace owner (tenant console). Mutually exclusive with adminId. */
  tenantId?: mongoose.Types.ObjectId;
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

/** Default console username per protocol when one is not supplied. */
function defaultUsernameFor(protocol: ExternalVMProtocol): string {
  return protocol === 'ssh' ? 'root' : 'Administrator';
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
      enum: ['rdp', 'ssh'],
      required: true,
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
  if (!this.username) {
    this.username = defaultUsernameFor(this.protocol);
  }
  const hasAdmin = Boolean(this.adminId);
  const hasTenant = Boolean(this.tenantId);
  if (hasAdmin === hasTenant) {
    next(new Error('External VM must belong to exactly one of adminId or tenantId.'));
    return;
  }
  next();
});

externalVMSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const ExternalVMModel = mongoose.model<IExternalVM>('ExternalVM', externalVMSchema);
