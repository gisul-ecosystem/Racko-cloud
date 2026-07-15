import mongoose, { Document, Schema } from 'mongoose';

export type ExternalVmPricingProvider = 'webyne';
export type ExternalVmPricingCategory = 'linux' | 'windows' | 'gpu';
export type ExternalVmPricingPeriod = 'hourly' | 'monthly' | 'quarterly' | 'yearly';

export type PlanPeriodOverrides = Partial<Record<ExternalVmPricingPeriod, string>>;

export interface CategoryPricingOverride {
  /** Sell multiplier applied to scraped amounts when a period override is empty (e.g. 2 or 3). */
  multiplier: number;
  /** Per-plan absolute overrides keyed by provider planId string. */
  plans: Record<string, PlanPeriodOverrides>;
}

export interface IExternalVmPricingConfig extends Document {
  _id: mongoose.Types.ObjectId;
  provider: ExternalVmPricingProvider;
  categories: {
    linux: CategoryPricingOverride;
    windows: CategoryPricingOverride;
    gpu: CategoryPricingOverride;
  };
  updatedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const planPeriodsSchema = new Schema(
  {
    hourly: { type: String, trim: true },
    monthly: { type: String, trim: true },
    quarterly: { type: String, trim: true },
    yearly: { type: String, trim: true },
  },
  { _id: false }
);

const categoryOverrideSchema = new Schema(
  {
    multiplier: { type: Number, required: true, default: 1, min: 0.01 },
    plans: {
      type: Map,
      of: planPeriodsSchema,
      default: {},
    },
  },
  { _id: false }
);

const externalVmPricingConfigSchema = new Schema<IExternalVmPricingConfig>(
  {
    provider: {
      type: String,
      required: true,
      enum: ['webyne'],
      unique: true,
      index: true,
    },
    categories: {
      linux: { type: categoryOverrideSchema, default: () => ({ multiplier: 1, plans: {} }) },
      windows: { type: categoryOverrideSchema, default: () => ({ multiplier: 1, plans: {} }) },
      gpu: { type: categoryOverrideSchema, default: () => ({ multiplier: 1, plans: {} }) },
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

export const ExternalVmPricingConfig = mongoose.model<IExternalVmPricingConfig>(
  'ExternalVmPricingConfig',
  externalVmPricingConfigSchema
);
