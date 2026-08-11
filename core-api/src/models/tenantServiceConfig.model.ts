import mongoose, { Document, Schema } from 'mongoose';
import type { ServiceKey } from '../constants/serviceCatalog';

export type TenantServiceConfigStatus = 'active' | 'suspended';

export interface ITenantServiceConfig extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  serviceKey: ServiceKey;
  status: TenantServiceConfigStatus;
  limits: Record<string, unknown>;
  pricing: Record<string, unknown>;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const tenantServiceConfigSchema = new Schema<ITenantServiceConfig>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
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
    limits: {
      type: Schema.Types.Mixed,
      required: true,
    },
    pricing: {
      type: Schema.Types.Mixed,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

tenantServiceConfigSchema.index({ tenantId: 1, serviceKey: 1 }, { unique: true });

export const TenantServiceConfig = mongoose.model<ITenantServiceConfig>(
  'TenantServiceConfig',
  tenantServiceConfigSchema
);
