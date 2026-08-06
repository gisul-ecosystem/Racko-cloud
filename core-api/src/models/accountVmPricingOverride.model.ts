import mongoose, { Document, Schema } from 'mongoose';

export type AccountVmPricingProvider = 'webyne' | 'dedicated';
export type AccountVmPricingScopeType = 'organization' | 'tenant';
export type AccountVmPricingCategory = 'linux' | 'windows' | 'gpu';
export type AccountVmPricingPeriod = 'hourly' | 'monthly' | 'quarterly' | 'yearly';

export type PlanPeriodAbsoluteOverrides = Partial<
  Record<AccountVmPricingPeriod, number | null>
>;

export interface DedicatedPlanAbsoluteOverride {
  monthlyPrice?: number | null;
  setupFee?: number | null;
}

export interface IAccountVmPricingOverride extends Document {
  _id: mongoose.Types.ObjectId;
  provider: AccountVmPricingProvider;
  scopeType: AccountVmPricingScopeType;
  /** Platform org owner User._id when scopeType=organization. */
  orgId?: mongoose.Types.ObjectId | null;
  /** Tenant._id when scopeType=tenant. */
  tenantId?: mongoose.Types.ObjectId | null;
  /** null = inherit global hourlyEnabled (Webyne only). */
  hourlyEnabled?: boolean | null;
  /**
   * Webyne: per-category multiplier overrides (null/omit = inherit global).
   * Dedicated: use categories.default.multiplier for the single sell multiplier.
   */
  categories: {
    linux?: { multiplier?: number | null };
    windows?: { multiplier?: number | null };
    gpu?: { multiplier?: number | null };
    /** Dedicated Server single multiplier bucket. */
    default?: { multiplier?: number | null };
  };
  /** Webyne: planId → absolute period sell prices. */
  planOverrides: Record<string, PlanPeriodAbsoluteOverrides>;
  /** Dedicated: planId → absolute monthly/setup sell prices. */
  dedicatedPlanOverrides: Record<string, DedicatedPlanAbsoluteOverride>;
  notes?: string | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const periodAbsoluteSchema = new Schema(
  {
    hourly: { type: Number, min: 0, default: null },
    monthly: { type: Number, min: 0, default: null },
    quarterly: { type: Number, min: 0, default: null },
    yearly: { type: Number, min: 0, default: null },
  },
  { _id: false }
);

const dedicatedPlanAbsoluteSchema = new Schema(
  {
    monthlyPrice: { type: Number, min: 0, default: null },
    setupFee: { type: Number, min: 0, default: null },
  },
  { _id: false }
);

const categoryMultiplierSchema = new Schema(
  {
    multiplier: { type: Number, min: 0.01, default: null },
  },
  { _id: false }
);

const accountVmPricingOverrideSchema = new Schema<IAccountVmPricingOverride>(
  {
    provider: {
      type: String,
      required: true,
      enum: ['webyne', 'dedicated'],
      index: true,
    },
    scopeType: {
      type: String,
      required: true,
      enum: ['organization', 'tenant'],
      index: true,
    },
    orgId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    hourlyEnabled: { type: Boolean, default: null },
    categories: {
      linux: { type: categoryMultiplierSchema, default: undefined },
      windows: { type: categoryMultiplierSchema, default: undefined },
      gpu: { type: categoryMultiplierSchema, default: undefined },
      default: { type: categoryMultiplierSchema, default: undefined },
    },
    planOverrides: {
      type: Map,
      of: periodAbsoluteSchema,
      default: {},
    },
    dedicatedPlanOverrides: {
      type: Map,
      of: dedicatedPlanAbsoluteSchema,
      default: {},
    },
    notes: { type: String, trim: true, maxlength: 500, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'account_vm_pricing_overrides' }
);

accountVmPricingOverrideSchema.index(
  { provider: 1, scopeType: 1, orgId: 1 },
  {
    unique: true,
    partialFilterExpression: { scopeType: 'organization', orgId: { $type: 'objectId' } },
  }
);

accountVmPricingOverrideSchema.index(
  { provider: 1, scopeType: 1, tenantId: 1 },
  {
    unique: true,
    partialFilterExpression: { scopeType: 'tenant', tenantId: { $type: 'objectId' } },
  }
);

export const AccountVmPricingOverride = mongoose.model<IAccountVmPricingOverride>(
  'AccountVmPricingOverride',
  accountVmPricingOverrideSchema
);
