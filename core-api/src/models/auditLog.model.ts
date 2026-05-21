import mongoose, { Document, Schema } from 'mongoose';

export type AuditEvent =
  | 'REGISTER'
  | 'EMAIL_VERIFICATION_SENT'
  | 'EMAIL_VERIFIED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED_UNVERIFIED'
  | 'LOGOUT'
  | 'TOKEN_REFRESHED'
  | 'TOKEN_REVOKED'
  | 'TOKEN_THEFT_DETECTED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED'
  | 'SUSPICIOUS_LOGIN'
  | 'PASSWORD_CHANGE';

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  event: AuditEvent;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    event: {
      type: String,
      required: true,
      enum: [
        'REGISTER',
        'EMAIL_VERIFICATION_SENT',
        'EMAIL_VERIFIED',
        'LOGIN_SUCCESS',
        'LOGIN_FAILED',
        'LOGIN_BLOCKED_UNVERIFIED',
        'LOGOUT',
        'TOKEN_REFRESHED',
        'TOKEN_REVOKED',
        'TOKEN_THEFT_DETECTED',
        'ACCOUNT_LOCKED',
        'ACCOUNT_UNLOCKED',
        'SUSPICIOUS_LOGIN',
        'PASSWORD_CHANGE',
      ],
      index: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    deviceFingerprint: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    strict: true,
    // Immutable — no updates allowed
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// TTL index: keep audit logs for 90 days
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
