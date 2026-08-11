import mongoose, { Document, Schema } from 'mongoose';
import {
  assignmentScheduleSchema,
  type AssignmentSchedule,
} from '../modules/external-vm/schedule.types';

export type ExternalVmAssignmentStatus = 'active' | 'expired' | 'revoked';

/** Many-to-many: tenant elastic server ↔ tenant end-user. */
export interface IExternalVmTenantAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  externalVmId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  /** Legacy audit field — prefer `assignedBy` for new writes. */
  assignedByTenantUserId?: mongoose.Types.ObjectId;
  /** Tenant user who created this assignment. */
  assignedBy?: mongoose.Types.ObjectId;
  schedule?: AssignmentSchedule | null;
  status: ExternalVmAssignmentStatus;
  createdAt: Date;
}

const externalVmTenantAssignmentSchema = new Schema<IExternalVmTenantAssignment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    externalVmId: { type: Schema.Types.ObjectId, ref: 'ExternalVM', required: true, index: true },
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true, index: true },
    assignedByTenantUserId: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
    schedule: { type: assignmentScheduleSchema, default: null },
    status: {
      type: String,
      enum: ['active', 'expired', 'revoked'],
      default: 'active',
      required: true,
      index: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { strict: true, timestamps: false }
);

externalVmTenantAssignmentSchema.index(
  { tenantId: 1, externalVmId: 1, tenantUserId: 1 },
  { unique: true }
);
externalVmTenantAssignmentSchema.index({ tenantId: 1, tenantUserId: 1 });

export const ExternalVmTenantAssignmentModel = mongoose.model<IExternalVmTenantAssignment>(
  'ExternalVmTenantAssignment',
  externalVmTenantAssignmentSchema
);
