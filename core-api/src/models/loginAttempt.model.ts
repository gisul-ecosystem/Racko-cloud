import mongoose, { Document, Schema } from 'mongoose';

export interface ILoginAttempt extends Document {
  _id: mongoose.Types.ObjectId;
  ipAddress: string;
  email: string;
  success: boolean;
  userAgent: string;
  createdAt: Date;
}

const loginAttemptSchema = new Schema<ILoginAttempt>(
  {
    ipAddress: {
      type: String,
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    success: {
      type: Boolean,
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

// TTL index: keep login attempts for 24 hours
loginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const LoginAttempt = mongoose.model<ILoginAttempt>('LoginAttempt', loginAttemptSchema);
