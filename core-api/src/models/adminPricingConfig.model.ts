import mongoose, { Document, Schema } from 'mongoose';

export interface TemplateRates {
  cpuRatePerCoreMonthly: number;    // integer ₹/core/month
  ramRatePerGbMonthly: number;      // integer ₹/GB/month
  diskRatePerGbMonthly: number;     // integer ₹/GB/month
  billingDiscounts: {
    quarterly: number;              // 0–1 fraction
    yearly: number;                 // 0–1 fraction
  };
}

export interface IAdminPricingConfig extends Document {
  _id: mongoose.Types.ObjectId;
  /** Keys are templateId (Proxmox vmid) as strings */
  templatePricing: Map<string, TemplateRates>;
  updatedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const templateRatesSchema = new Schema<TemplateRates>(
  {
    cpuRatePerCoreMonthly: { type: Number, required: true, default: 0, min: 0 },
    ramRatePerGbMonthly: { type: Number, required: true, default: 0, min: 0 },
    diskRatePerGbMonthly: { type: Number, required: true, default: 0, min: 0 },
    billingDiscounts: {
      quarterly: { type: Number, default: 0, min: 0, max: 1 },
      yearly: { type: Number, default: 0, min: 0, max: 1 },
    },
  },
  { _id: false }
);

const adminPricingConfigSchema = new Schema<IAdminPricingConfig>(
  {
    templatePricing: {
      type: Map,
      of: templateRatesSchema,
      default: {},
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

export const AdminPricingConfig = mongoose.model<IAdminPricingConfig>(
  'AdminPricingConfig',
  adminPricingConfigSchema
);
