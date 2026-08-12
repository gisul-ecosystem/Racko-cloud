import mongoose, { Document, Schema } from 'mongoose';

export type PhoneOtpPurpose = 'organization_onboarding_phone';

export interface IPhoneOtp extends Document {
  userId: mongoose.Types.ObjectId;
  phone: string;
  purpose: PhoneOtpPurpose;
  otpHash: string;
  expiresAt: Date;
  verifiedAt?: Date;
  verifiedUntil?: Date;
  attempts: number;
  sendCount: number;
  lastSentAt: Date;
  cleanupAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const phoneOtpSchema = new Schema<IPhoneOtp>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['organization_onboarding_phone'],
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    verifiedAt: {
      type: Date,
    },
    verifiedUntil: {
      type: Date,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    sendCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastSentAt: {
      type: Date,
      required: true,
    },
    cleanupAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

phoneOtpSchema.index({ userId: 1, phone: 1, purpose: 1 }, { unique: true });
phoneOtpSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

export const PhoneOtpModel = mongoose.model<IPhoneOtp>('PhoneOtp', phoneOtpSchema);
