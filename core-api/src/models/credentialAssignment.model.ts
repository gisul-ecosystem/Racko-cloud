import mongoose, { Document, Schema } from 'mongoose';

/**
 * The platform runs two disjoint identity systems, so an assignee is always
 * qualified by which one it came from.
 * - `platform_user` → User with role 'user', scoped by adminId
 * - `tenant_user`   → TenantUser, scoped by tenantId
 */
export type AssigneeType = 'platform_user' | 'tenant_user';
export type CredentialAssignmentStatus = 'active' | 'revoked';

/**
 * Grants one login to one person, under one project.
 *
 * Client start/end dates are NOT stored here — they are read live from the
 * referenced project so that editing a project immediately reflects in the
 * inventory. `projectId` is required because the inventory blocks assignment
 * when a project has no dates.
 */
export interface ICredentialAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  credentialId: mongoose.Types.ObjectId;
  /** Denormalized from the credential so the inventory can group by server cheaply. */
  serverId: mongoose.Types.ObjectId;
  assigneeType: AssigneeType;
  assigneeId: mongoose.Types.ObjectId;
  adminId?: mongoose.Types.ObjectId | null;
  tenantId?: mongoose.Types.ObjectId | null;
  projectId: mongoose.Types.ObjectId;
  status: CredentialAssignmentStatus;
  accessOverride: boolean;
  accessOverrideUntil?: Date | null;
  /**
   * Access window, field-for-field compatible with `AccessScheduleFields` so
   * `checkAccessWindow` can gate these assignments unchanged once the
   * connect/login path is wired to the inventory.
   */
  accessStartDate?: Date | null;
  accessEndDate?: Date | null;
  accessStartTime?: string | null;
  accessEndTime?: string | null;
  weeklySchedule?: unknown[] | null;
  weeklyScheduleTz?: string | null;
  assignedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const credentialAssignmentSchema = new Schema<ICredentialAssignment>(
  {
    credentialId: {
      type: Schema.Types.ObjectId,
      ref: 'ServerCredential',
      required: true,
      index: true,
    },
    serverId: {
      type: Schema.Types.ObjectId,
      ref: 'Server',
      required: true,
      index: true,
    },
    assigneeType: {
      type: String,
      enum: ['platform_user', 'tenant_user'],
      required: true,
    },
    assigneeId: { type: Schema.Types.ObjectId, required: true, index: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'revoked'],
      default: 'active',
      required: true,
      index: true,
    },
    accessOverride: { type: Boolean, default: false, index: true },
    accessOverrideUntil: { type: Date, default: null },
    accessStartDate: { type: Date, default: null },
    accessEndDate: { type: Date, default: null },
    accessStartTime: { type: String, default: null, trim: true },
    accessEndTime: { type: String, default: null, trim: true },
    weeklySchedule: { type: Schema.Types.Mixed, default: null },
    weeklyScheduleTz: { type: String, default: 'Asia/Kolkata', trim: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'credential_assignments' }
);

credentialAssignmentSchema.index({ credentialId: 1, assigneeId: 1 }, { unique: true });

export const CredentialAssignmentModel = mongoose.model<ICredentialAssignment>(
  'CredentialAssignment',
  credentialAssignmentSchema
);
