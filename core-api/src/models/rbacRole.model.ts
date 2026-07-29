import mongoose, { Document, Schema } from 'mongoose';

export interface IRbacRole extends Document {
  _id: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const rbacRoleSchema = new Schema<IRbacRole>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'rbac_roles' }
);

export const RbacRoleModel = mongoose.model<IRbacRole>('RbacRole', rbacRoleSchema);
