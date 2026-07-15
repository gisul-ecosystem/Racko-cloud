import mongoose, { Document, Schema } from 'mongoose';

export type ExternalVMProtocol = 'rdp' | 'ssh';

export interface IExternalVM extends Document {
  _id: mongoose.Types.ObjectId;

  // Connection details
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  username: string;
  /** AES-256-CBC encrypted password (encrypt/decrypt handled in the service). */
  password: string;

  /** Platform admin owner (admin console). Mutually exclusive with tenantId. */
  adminId?: mongoose.Types.ObjectId;
  /** Tenant workspace owner (tenant console). Mutually exclusive with adminId. */
  tenantId?: mongoose.Types.ObjectId;
  /** Tenant user who created the record (optional audit). */
  createdByTenantUserId?: mongoose.Types.ObjectId;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/** Default console username per protocol when one is not supplied. */
function defaultUsernameFor(protocol: ExternalVMProtocol): string {
  return protocol === 'ssh' ? 'root' : 'Administrator';
}

const externalVMSchema = new Schema<IExternalVM>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ipAddress: {
      type: String,
      required: true,
      trim: true,
    },
    protocol: {
      type: String,
      enum: ['rdp', 'ssh'],
      required: true,
    },
    username: {
      type: String,
      trim: true,
      default: undefined,
    },
    password: {
      type: String,
      required: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: false,
      index: true,
    },
    createdByTenantUserId: {
      type: Schema.Types.ObjectId,
      ref: 'TenantUser',
      required: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    strict: true,
    timestamps: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

externalVMSchema.index({ tenantId: 1, createdAt: -1 });

externalVMSchema.pre('validate', function (next) {
  if (!this.username) {
    this.username = defaultUsernameFor(this.protocol);
  }
  const hasAdmin = Boolean(this.adminId);
  const hasTenant = Boolean(this.tenantId);
  if (hasAdmin === hasTenant) {
    next(new Error('External VM must belong to exactly one of adminId or tenantId.'));
    return;
  }
  next();
});

externalVMSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const ExternalVMModel = mongoose.model<IExternalVM>('ExternalVM', externalVMSchema);
