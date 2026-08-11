import mongoose, { Document, Schema } from 'mongoose';

export type TenantUserRole = 'tenant_admin' | 'tenant_user';

export interface ITenantUser extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  email: string;
  /** Optional login alias — unique per tenant when set. */
  username?: string | null;
  passwordHash: string;
  role: TenantUserRole;
  /**
   * Console operator (invited via Access control). Distinct from elastic end-users
   * who share role `tenant_user` but are not console staff.
   */
  isConsoleOperator: boolean;
  isActive: boolean;
  isEmailVerified: boolean;
  /** Console invite / verify flow — hashed token from invite email. */
  emailVerificationTokenHash: string | null;
  emailVerificationExpiresAt: Date | null;
  /** True until invitee sets their own password via reset link. */
  mustSetPassword: boolean;
  resetTokenHash: string | null;
  resetTokenExpiresAt: Date | null;
  createdBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const tenantUserSchema = new Schema<ITenantUser>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['tenant_admin', 'tenant_user'],
      required: true,
    },
    isConsoleOperator: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: true,
    },
    emailVerificationTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
      default: null,
    },
    mustSetPassword: {
      type: Boolean,
      default: false,
    },
    resetTokenHash: {
      type: String,
      default: null,
    },
    resetTokenExpiresAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'TenantUser',
      default: null,
    },
  },
  { timestamps: true }
);

tenantUserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
tenantUserSchema.index({ tenantId: 1, username: 1 }, { unique: true, sparse: true });

export const TenantUser = mongoose.model<ITenantUser>('TenantUser', tenantUserSchema);
