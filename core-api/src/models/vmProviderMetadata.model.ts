import mongoose, { Document, Schema } from 'mongoose';

export type ProviderPlanDuration = 'monthly' | 'quarterly' | 'hourly' | 'yearly';

export interface IVmProviderMetadata extends Document {
  _id: mongoose.Types.ObjectId;
  ipAddress: string;
  planDuration?: ProviderPlanDuration | null;
  providerUsername?: string | null;
  providerPassword?: string | null;
  providerStartDate?: Date | null;
  providerEndDate?: Date | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const vmProviderMetadataSchema = new Schema<IVmProviderMetadata>(
  {
    ipAddress: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    planDuration: {
      type: String,
      enum: ['monthly', 'quarterly', 'hourly', 'yearly'],
      default: null,
    },
    providerUsername: {
      type: String,
      trim: true,
      default: null,
    },
    providerPassword: {
      type: String,
      default: null,
    },
    providerStartDate: {
      type: Date,
      default: null,
    },
    providerEndDate: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    strict: true,
    timestamps: true,
    collection: 'vm_provider_metadata',
  }
);

export const VmProviderMetadataModel = mongoose.model<IVmProviderMetadata>(
  'VmProviderMetadata',
  vmProviderMetadataSchema
);
