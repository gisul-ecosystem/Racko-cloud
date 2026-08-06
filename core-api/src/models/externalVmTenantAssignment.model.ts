import mongoose, { Document, Schema } from 'mongoose';

/** Many-to-many: tenant elastic server ↔ tenant end-user. */
export interface IExternalVmTenantAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  externalVmId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  assignedByTenantUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const externalVmTenantAssignmentSchema = new Schema<IExternalVmTenantAssignment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    externalVmId: { type: Schema.Types.ObjectId, ref: 'ExternalVM', required: true, index: true },
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true, index: true },
    assignedByTenantUserId: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
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
