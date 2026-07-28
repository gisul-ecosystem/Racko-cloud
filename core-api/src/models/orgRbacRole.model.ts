import mongoose, { Document, Schema } from 'mongoose';

export type OrgRbacScope = 'platform' | 'tenant';

export interface IOrgRbacRole extends Document {
  _id: mongoose.Types.ObjectId;
  scope: OrgRbacScope;
  /** Platform: org owner userId. Tenant: tenantId. */
  orgId: string;
  slug: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orgRbacRoleSchema = new Schema<IOrgRbacRole>(
  {
    scope: {
      type: String,
      enum: ['platform', 'tenant'],
      required: true,
      index: true,
    },
    orgId: { type: String, required: true, index: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: String },
  },
  { timestamps: true, collection: 'org_rbac_roles' }
);

orgRbacRoleSchema.index({ scope: 1, orgId: 1, slug: 1 }, { unique: true });

export const OrgRbacRoleModel = mongoose.model<IOrgRbacRole>('OrgRbacRole', orgRbacRoleSchema);
