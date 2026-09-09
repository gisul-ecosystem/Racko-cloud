import mongoose, { Document, Schema } from 'mongoose';

export type ServerCredentialStatus = 'active' | 'disabled';

/**
 * One login on a server. A server can carry many of these, which is how the
 * inventory models "one IP, several username/password pairs" without duplicating
 * the server record.
 */
export interface IServerCredential extends Document {
  _id: mongoose.Types.ObjectId;
  serverId: mongoose.Types.ObjectId;
  username: string;
  /** AES-256-CBC encrypted via utils/crypto. Never returned in list responses. */
  password: string;
  label?: string | null;
  isPrimary: boolean;
  status: ServerCredentialStatus;
  createdAt: Date;
  updatedAt: Date;
}

const serverCredentialSchema = new Schema<IServerCredential>(
  {
    serverId: {
      type: Schema.Types.ObjectId,
      ref: 'Server',
      required: true,
      index: true,
    },
    username: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    label: { type: String, trim: true, default: null },
    isPrimary: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true, collection: 'server_credentials' }
);

serverCredentialSchema.index({ serverId: 1, username: 1 }, { unique: true });

export const ServerCredentialModel = mongoose.model<IServerCredential>(
  'ServerCredential',
  serverCredentialSchema
);
