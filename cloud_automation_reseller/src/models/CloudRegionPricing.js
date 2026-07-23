import mongoose from 'mongoose';

const cloudRegionPricingSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['aws', 'azure', 'gcp', 'oci', 'webyne'],
      required: true,
      index: true,
    },
    region: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['linux', 'windows', 'gpu'],
      required: true,
      index: true,
    },
    canonicalSpec: { type: String, required: true, trim: true, index: true },
    /** Separates normal cheapest SKUs from nested-virt-capable SKUs in the cache. */
    pricingMode: {
      type: String,
      enum: ['normal', 'nested'],
      required: true,
      default: 'normal',
      index: true,
    },
    rawComputePricePerHr: { type: Number, required: true, min: 0 },
    rawStoragePricePerHr: { type: Number, default: 0, min: 0 },
    rawIpPricePerHr: { type: Number, default: 0, min: 0 },
    rawTotalPricePerHr: { type: Number, required: true, min: 0, index: true },
    currency: { type: String, default: 'USD', trim: true },
    instanceType: { type: String, trim: true },
    fetchedAt: { type: Date, required: true, default: Date.now },
    source: {
      type: String,
      enum: ['api', 'scrape'],
      default: 'api',
    },
  },
  {
    collection: 'cloud_region_pricing',
    timestamps: false,
  }
);

cloudRegionPricingSchema.index(
  { canonicalSpec: 1, category: 1, pricingMode: 1, rawTotalPricePerHr: 1 },
  { name: 'spec_category_mode_price' }
);

cloudRegionPricingSchema.index(
  { provider: 1, region: 1, category: 1, canonicalSpec: 1, pricingMode: 1 },
  { unique: true, name: 'provider_region_spec_mode_unique' }
);

/** Normalize nestedVirtualization flag → storage pricingMode. */
export function toPricingMode(nestedVirtualization) {
  return nestedVirtualization === true || nestedVirtualization === 'true' || nestedVirtualization === '1'
    ? 'nested'
    : 'normal';
}

/**
 * Query filter for pricingMode that stays compatible with legacy rows
 * (missing pricingMode treated as normal).
 */
export function pricingModeQuery(pricingMode) {
  if (pricingMode === 'nested') {
    return { pricingMode: 'nested' };
  }
  return {
    $or: [{ pricingMode: 'normal' }, { pricingMode: { $exists: false } }],
  };
}

const CloudRegionPricing = mongoose.model('CloudRegionPricing', cloudRegionPricingSchema);

export default CloudRegionPricing;
