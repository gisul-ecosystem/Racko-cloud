import mongoose, { Document, Schema } from 'mongoose';
import type { OrgRbacScope } from './orgRbacRole.model';

export interface IOrgRbacAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  scope: OrgRbacScope;
  orgId: string;
  /** Platform: User._id. Tenant: TenantUser._id. */
  subjectId: string;
  roleId: mongoose.Types.ObjectId;
  assignedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orgRbacAssignmentSchema = new Schema<IOrgRbacAssignment>(
  {
    scope: {
      type: String,
      enum: ['platform', 'tenant'],
      required: true,
      index: true,
    },
    orgId: { type: String, required: true, index: true },
    subjectId: { type: String, required: true, index: true },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'OrgRbacRole',
      required: true,
      index: true,
    },
    assignedBy: { type: String },
  },
  { timestamps: true, collection: 'org_rbac_assignments' }
);

orgRbacAssignmentSchema.index(
  { scope: 1, orgId: 1, subjectId: 1, roleId: 1 },
  { unique: true }
);

export const OrgRbacAssignmentModel = mongoose.model<IOrgRbacAssignment>(
  'OrgRbacAssignment',
  orgRbacAssignmentSchema
);
