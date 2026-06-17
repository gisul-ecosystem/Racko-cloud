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

  // Ownership
  adminId: mongoose.Types.ObjectId;

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
      // adminId references an admin user stored in the 'User' collection
      // (the platform has no separate 'Admin' model), matching the VM model.
      ref: 'User',
      required: true,
      index: true,
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
    // Timestamps are managed manually (see pre-save hook) per spec.
    timestamps: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// Default the console username from the protocol when the caller omits it.
externalVMSchema.pre('validate', function (next) {
  if (!this.username) {
    this.username = defaultUsernameFor(this.protocol);
  }
  next();
});

// Bump updatedAt on every save.
externalVMSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const ExternalVMModel = mongoose.model<IExternalVM>('ExternalVM', externalVMSchema);
