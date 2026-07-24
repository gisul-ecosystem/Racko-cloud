import mongoose, { Document, Schema } from 'mongoose';

export type BulkAssignJobKind =
  | 'platform_vm'
  | 'platform_external_vm'
  | 'tenant_external_vm';

export type BulkAssignJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed';

/** Normalized pair row stored on the job (covers VM + external VM fields). */
export interface IBulkAssignPairRow {
  resourceId: string;
  resourceName: string;
  userId?: string;
  userEmail: string;
  password?: string;
  status: 'assigned' | 'failed';
  error?: string;
}

export interface IBulkAssignJob extends Document {
  _id: mongoose.Types.ObjectId;
  kind: BulkAssignJobKind;
  status: BulkAssignJobStatus;
  total: number;
  completed: number;
  failed: number;
  pending: number;

  /** Platform admin owner (platform_vm / platform_external_vm). */
  adminId?: mongoose.Types.ObjectId;
  /** Tenant scope (tenant_external_vm). */
  tenantId?: mongoose.Types.ObjectId;
  createdByTenantUserId?: mongoose.Types.ObjectId;

  /** Original request body (validated upstream). */
  request: Record<string, unknown>;

  pairs: IBulkAssignPairRow[];
  errorMessage?: string;

  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pairRowSchema = new Schema<IBulkAssignPairRow>(
  {
    resourceId: { type: String, required: true },
    resourceName: { type: String, required: true },
    userId: { type: String },
    userEmail: { type: String, required: true },
    password: { type: String },
    status: { type: String, enum: ['assigned', 'failed'], required: true },
    error: { type: String },
  },
  { _id: false }
);

const bulkAssignJobSchema = new Schema<IBulkAssignJob>(
  {
    kind: {
      type: String,
      enum: ['platform_vm', 'platform_external_vm', 'tenant_external_vm'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'partial', 'failed'],
      default: 'pending',
      required: true,
      index: true,
    },
    total: { type: Number, required: true, min: 1 },
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    pending: { type: Number, required: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    createdByTenantUserId: { type: Schema.Types.ObjectId, ref: 'TenantUser', index: true },
    request: { type: Schema.Types.Mixed, required: true },
    pairs: { type: [pairRowSchema], default: [] },
    errorMessage: { type: String },
    startedAt: { type: Date, required: true, default: () => new Date() },
    completedAt: { type: Date },
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

// TTL: keep jobs for 30 days (matches VMJob)
bulkAssignJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const BulkAssignJob = mongoose.model<IBulkAssignJob>('BulkAssignJob', bulkAssignJobSchema);
