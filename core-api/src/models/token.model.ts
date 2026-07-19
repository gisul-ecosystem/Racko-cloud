import mongoose, { Document, Schema } from 'mongoose';

export interface IToken extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  family: string;
  deviceFingerprint: string;
  isRevoked: boolean;
  replacedByToken?: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}

const tokenSchema = new Schema<IToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    family: {
      type: String,
      required: true,
      index: true,
    },
    deviceFingerprint: {
      type: String,
      required: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
    replacedByToken: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index — MongoDB auto-deletes expired tokens
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
  },
  {
    strict: true,
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Token = mongoose.model<IToken>('Token', tokenSchema);
