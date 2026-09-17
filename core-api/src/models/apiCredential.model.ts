import mongoose, { Document, Schema } from 'mongoose';

export type ApiCredentialOwnerType = 'tenant' | 'platform';
export type ApiCredentialStatus = 'active' | 'revoked';

export const DEFAULT_API_CREDENTIAL_SCOPES = [
  'vms:read',
  'vms:write',
  'vms:console',
  'vms:assign',
] as const;

export interface IApiCredential extends Document {
  _id: mongoose.Types.ObjectId;
  clientId: string;
  clientSecretHash: string;
  name: string;
  ownerType: ApiCredentialOwnerType;
  tenantId?: mongoose.Types.ObjectId | null;
  adminId?: mongoose.Types.ObjectId | null;
  scopes: string[];
  /** Override PUBLIC_API_RATE_LIMIT_PER_MIN when set (requests per minute). */
  rateLimitPerMin?: number | null;
  status: ApiCredentialStatus;
  lastUsedAt?: Date | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const apiCredentialSchema = new Schema<IApiCredential>(
  {
    clientId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    clientSecretHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    ownerType: {
      type: String,
      enum: ['tenant', 'platform'],
      required: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    scopes: {
      type: [String],
      default: () => [...DEFAULT_API_CREDENTIAL_SCOPES],
    },
    rateLimitPerMin: {
      type: Number,
      default: null,
      min: 1,
      max: 10_000,
    },
    status: {
      type: String,
      enum: ['active', 'revoked'],
      default: 'active',
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    strict: true,
    timestamps: true,
  }
);

apiCredentialSchema.pre('validate', function (next) {
  if (this.ownerType === 'tenant') {
    if (!this.tenantId) {
      next(new Error('tenantId is required for tenant-owned API credentials.'));
      return;
    }
    if (this.adminId) {
      next(new Error('adminId must not be set for tenant-owned API credentials.'));
      return;
    }
  } else if (this.ownerType === 'platform') {
    if (!this.adminId) {
      next(new Error('adminId is required for platform-owned API credentials.'));
      return;
    }
    if (this.tenantId) {
      next(new Error('tenantId must not be set for platform-owned API credentials.'));
      return;
    }
  }
  next();
});

export const ApiCredentialModel = mongoose.model<IApiCredential>(
  'ApiCredential',
  apiCredentialSchema
);
