import mongoose, { Document, Schema } from 'mongoose';

export type TenantStatus = 'pending' | 'active' | 'suspended' | 'cancelled';

export interface ITenantBranding {
  logoUrl?: string;
  faviconUrl?: string;
  loginPageImageUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  supportEmail?: string;
}

export interface ITenantLimits {
  maxVms?: number;
  maxManagedUsers?: number;
}

export interface ITenant extends Document {
  _id: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  domain: string;
  status: TenantStatus;
  branding: ITenantBranding;
  enabledServices: string[];
  limits: ITenantLimits;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const brandingSchema = new Schema<ITenantBranding>(
  {
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' },
    loginPageImageUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '' },
    secondaryColor: { type: String, default: '' },
    supportEmail: { type: String, default: '' },
  },
  { _id: false }
);

const limitsSchema = new Schema<ITenantLimits>(
  {
    maxVms: { type: Number },
    maxManagedUsers: { type: Number },
  },
  { _id: false }
);

const tenantSchema = new Schema<ITenant>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      immutable: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    domain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'cancelled'],
      default: 'pending',
      required: true,
      index: true,
    },
    branding: {
      type: brandingSchema,
      default: () => ({}),
    },
    enabledServices: {
      type: [String],
      default: [],
    },
    limits: {
      type: limitsSchema,
      default: () => ({}),
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

export const Tenant = mongoose.model<ITenant>('Tenant', tenantSchema);
