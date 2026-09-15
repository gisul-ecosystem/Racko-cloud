import mongoose, { Document, Schema } from 'mongoose';
import type { ApiCredentialOwnerType } from './apiCredential.model';

export interface IApiCredentialAccessLog extends Document {
  _id: mongoose.Types.ObjectId;
  credentialId: mongoose.Types.ObjectId;
  clientId: string;
  ownerType: ApiCredentialOwnerType;
  method: string;
  route: string;
  statusCode: number;
  createdAt: Date;
}

const apiCredentialAccessLogSchema = new Schema<IApiCredentialAccessLog>(
  {
    credentialId: {
      type: Schema.Types.ObjectId,
      ref: 'ApiCredential',
      required: true,
      index: true,
    },
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    ownerType: {
      type: String,
      enum: ['tenant', 'platform'],
      required: true,
    },
    method: {
      type: String,
      required: true,
    },
    route: {
      type: String,
      required: true,
    },
    statusCode: {
      type: Number,
      required: true,
    },
  },
  {
    strict: true,
    timestamps: { createdAt: true, updatedAt: false },
  }
);

apiCredentialAccessLogSchema.index({ credentialId: 1, createdAt: -1 });
apiCredentialAccessLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ApiCredentialAccessLog = mongoose.model<IApiCredentialAccessLog>(
  'ApiCredentialAccessLog',
  apiCredentialAccessLogSchema
);
