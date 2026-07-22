import CloudRegionPricing from '../models/CloudRegionPricing.js';
import { resolveSpecParts } from '../config/specMap.js';
import { normalizeProviders } from '../config/cloudProviders.js';
import { ensureSpecPricing } from './ensureSpecPricing.js';

function toSelectResult(row, reason, providersUsed) {
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
    providersUsed,
  };
}

function buildResolvedSkus(mappings, providersUsed) {
  if (!mappings) return undefined;
  const out = {};
  if (providersUsed.includes('aws')) {
    out.aws = mappings.aws?.instanceType || null;
  }
  if (providersUsed.includes('azure')) {
    out.azure = mappings.azure?.vmSize || null;
  }
  if (providersUsed.includes('oci')) {
    out.oci = mappings.oci
      ? `${mappings.oci.shape}/${mappings.oci.ocpus}ocpu`
      : null;
  }
  if (providersUsed.includes('gcp')) {
    out.gcp = mappings.gcp?.machineType || null;
  }
  return out;
}

/**
 * Select provider/region for a catalog purchase.
 * durationDays >= 30 → webyne (manual fulfillment).
 * else → cheapest among requested providers (default: all).
 */
export async function selectProvider({
  canonicalSpec,
  category,
  durationDays,
  specs,
  providers,
} = {}) {
  const providersUsed = normalizeProviders(providers);
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
      providersUsed,
    };
  }

  let row = await CloudRegionPricing.findOne({
    canonicalSpec: spec,
    category: cat,
    provider: { $in: providersUsed },
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
      providers: providersUsed,
    });

    row = await CloudRegionPricing.findOne({
      canonicalSpec: spec,
      category: cat,
      provider: { $in: providersUsed },
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
      providersUsed,
      dynamicPricing: dynamicMeta,
    };
  }

  const resolvedSkus = buildResolvedSkus(dynamicMeta?.mappings, providersUsed);

  return {
    ...toSelectResult(
      row,
      dynamicMeta && !dynamicMeta.cached ? 'cheapest_cloud_dynamic' : 'cheapest_cloud',
      providersUsed
    ),
    ...(resolvedSkus ? { resolvedSkus } : {}),
  };
}
