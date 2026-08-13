import mongoose, { Document, Schema } from 'mongoose';
import type { AdminServiceKey } from '../constants/adminServiceCatalog';

export type AdminServiceConfigStatus = 'active' | 'suspended';

export interface IAdminServiceConfig extends Document {
  _id: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId;
  serviceKey: AdminServiceKey;
  status: AdminServiceConfigStatus;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const adminServiceConfigSchema = new Schema<IAdminServiceConfig>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    serviceKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true, collection: 'admin_service_configs' }
);

adminServiceConfigSchema.index({ adminId: 1, serviceKey: 1 }, { unique: true });

export const AdminServiceConfig = mongoose.model<IAdminServiceConfig>(
  'AdminServiceConfig',
  adminServiceConfigSchema
);
