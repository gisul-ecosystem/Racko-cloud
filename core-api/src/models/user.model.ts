import mongoose, { Document, Model, Schema } from 'mongoose';
import { hashPassword, verifyPassword } from '../utils/argon2';
import { v4 as uuidv4 } from 'uuid';
import type { UserRole, AccountType, OnboardingStatus } from '../types';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  name?: string;
  phone?: string;
  role: UserRole;
  accountType: AccountType;
  onboardingStatus: OnboardingStatus;
  isEmailVerified: boolean;
  isActive: boolean;
  isLocked: boolean;
  lockedUntil?: Date;
  failedLoginAttempts: number;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  lastLoginDevice?: string;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  mustSetPassword?: boolean;
  createdBy?: mongoose.Types.ObjectId;  // admin who provisioned this user (null for self-registered)
  /** When set on role=admin, this user is an org operator under the owner admin. */
  orgOwnerId?: mongoose.Types.ObjectId;
  enrollmentKey: string;                // used for VM template agent auto-registration
  /** Platform admin service entitlements were initialized (defaults or full catalog). */
  adminServicesSeeded?: boolean;
  // MFA_SLOT: mfaEnabled: boolean (default: false)
  // MFA_SLOT: mfaSecret?: string
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

export interface IUserModel extends Model<IUser> {
  findByEmail(email: string): Promise<IUser | null>;
}

const userSchema = new Schema<IUser, IUserModel>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 15,
    },
    password: {
      type: String,
      required: true,
      select: false, // Never returned in queries by default
    },
    role: {
      type: String,
      enum: ['super_admin', 'staff', 'admin', 'user'],
      default: 'admin',
      required: true,
    },
    accountType: {
      type: String,
      enum: ['legacy', 'b2c', 'b2b'],
      default: 'b2c',
      index: true,
    },
    onboardingStatus: {
      type: String,
      enum: ['active', 'kyc_pending', 'org_details_pending', 'org_review_pending', 'org_approved', 'org_rejected'],
      default: 'active',
      index: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockedUntil: {
      type: Date,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lastLoginAt: {
      type: Date,
    },
    lastLoginIp: {
      type: String,
    },
    lastLoginDevice: {
      type: String,
    },
    emailVerificationToken: {
      type: String,
      select: false, // Never returned in queries by default
      index: true,
    },
    emailVerificationExpires: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
    passwordResetToken: {
      type: String,
      select: false,
      index: true,
    },
    passwordResetExpires: {
      type: Date,
    },
    mustSetPassword: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    orgOwnerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    enrollmentKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    adminServicesSeeded: {
      type: Boolean,
      default: false,
    },
  },
  {
    strict: true,
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['password'];
        delete ret['emailVerificationToken'];
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// Hash password with argon2id before saving if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await hashPassword(this.password);
  if (!this.isNew) {
    this.passwordChangedAt = new Date();
  }
  next();
});

// Auto-generate enrollmentKey for new admin/super_admin users
userSchema.pre('save', function (next) {
  if (this.isNew && !this.enrollmentKey) {
    this.enrollmentKey = uuidv4();
  }
  next();
});

// Instance method: compare password
userSchema.methods['comparePassword'] = async function (candidate: string): Promise<boolean> {
  return verifyPassword(this.password as string, candidate);
};

// Static method: find by email (always select password for auth)
userSchema.statics['findByEmail'] = function (email: string): Promise<IUser | null> {
  return this.findOne({ email: email.toLowerCase().trim() })
    .select('+password +emailVerificationToken')
    .exec();
};

export const User = mongoose.model<IUser, IUserModel>('User', userSchema);
