import CloudRegionPricing from '../models/CloudRegionPricing.js';
import { resolveSpecParts } from '../config/specMap.js';
import { ensureSpecPricing } from './ensureSpecPricing.js';

function toSelectResult(row, reason) {
  return {
    provider: row.provider,
    region: row.region,
    category: row.category,
    canonicalSpec: row.canonicalSpec,
    rawComputePricePerHr: row.rawComputePricePerHr,
    rawStoragePricePerHr: row.rawStoragePricePerHr,
    rawIpPricePerHr: row.rawIpPricePerHr,
    rawTotalPricePerHr: row.rawTotalPricePerHr,
    instanceType: row.instanceType,
    currency: row.currency || 'USD',
    autoProvisioned: true,
    reason,
    fetchedAt: row.fetchedAt,
  };
}

/**
 * Select provider/region for a catalog purchase.
 * durationDays >= 30 → webyne (manual fulfillment).
 * else → cheapest aws|azure for the requested spec (prices fetched dynamically if missing).
 */
export async function selectProvider({
  canonicalSpec,
  category,
  durationDays,
  specs,
} = {}) {
  const days = Number(durationDays) || 0;
  const cat = category || 'linux';
  const parts = resolveSpecParts(canonicalSpec, specs || {}, cat);
  const spec = parts.canonicalSpec;

  if (days >= 30) {
    return {
      provider: 'webyne',
      region: null,
      category: cat,
      canonicalSpec: spec,
      rawTotalPricePerHr: null,
      autoProvisioned: false,
      reason: 'duration_gte_30_days',
    };
  }

  let row = await CloudRegionPricing.findOne({
    canonicalSpec: spec,
    category: cat,
    provider: { $in: ['aws', 'azure'] },
  })
    .sort({ rawTotalPricePerHr: 1 })
    .lean();

  let dynamicMeta = null;
  if (!row) {
    dynamicMeta = await ensureSpecPricing({
      canonicalSpec: spec,
      category: cat,
      vcpu: parts.vcpu,
      ramGb: parts.ramGb,
      diskGb: parts.diskGb,
      gpu: parts.gpu,
    });

    row = await CloudRegionPricing.findOne({
      canonicalSpec: spec,
      category: cat,
      provider: { $in: ['aws', 'azure'] },
    })
      .sort({ rawTotalPricePerHr: 1 })
      .lean();
  }

  if (!row) {
    return {
      provider: 'webyne',
      region: null,
      category: cat,
      canonicalSpec: spec,
      rawTotalPricePerHr: null,
      autoProvisioned: false,
      reason: 'no_cloud_pricing_for_spec',
      dynamicPricing: dynamicMeta,
    };
  }

  return {
    ...toSelectResult(
      row,
      dynamicMeta && !dynamicMeta.cached ? 'cheapest_cloud_dynamic' : 'cheapest_cloud'
    ),
    ...(dynamicMeta?.mappings
      ? {
          resolvedSkus: {
            aws: dynamicMeta.mappings.aws?.instanceType || null,
            azure: dynamicMeta.mappings.azure?.vmSize || null,
          },
        }
      : {}),
  };
}
