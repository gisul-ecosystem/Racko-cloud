import CloudRegionPricing, {
  toPricingMode,
  pricingModeQuery,
} from '../models/CloudRegionPricing.js';
import { resolveSpecParts } from '../config/specMap.js';
import { normalizeProviders } from '../config/cloudProviders.js';
import { ensureSpecPricing } from './ensureSpecPricing.js';

/** Round USD/hr to 8 decimal places (avoids IEEE float noise in API responses). */
function roundUsdHr(n) {
  return Math.round((Number(n) || 0) * 1e8) / 1e8;
}

/** Map a CloudRegionPricing row into the /api/select payload (incl. public vs private IP). */
export function toSelectResult(row, reason, providersUsed) {
  const compute = Number(row.rawComputePricePerHr) || 0;
  const storage = Number(row.rawStoragePricePerHr) || 0;
  const publicIp = roundUsdHr(row.rawIpPricePerHr);
  const privateIp = 0; // private NIC/IP is included; not billed separately
  const withPublicIp = roundUsdHr(
    Number(row.rawTotalPricePerHr) || compute + storage + publicIp
  );
  const withPrivateIp = roundUsdHr(compute + storage + privateIp);

  return {
    provider: row.provider,
    region: row.region,
    category: row.category,
    canonicalSpec: row.canonicalSpec,
    pricingMode: row.pricingMode || 'normal',
    nestedVirtualization: (row.pricingMode || 'normal') === 'nested',
    rawComputePricePerHr: row.rawComputePricePerHr,
    rawStoragePricePerHr: row.rawStoragePricePerHr,
    /** @deprecated Prefer rawPublicIpPricePerHr — same value (public IP hourly). */
    rawIpPricePerHr: publicIp,
    rawPublicIpPricePerHr: publicIp,
    rawPrivateIpPricePerHr: privateIp,
    /** Total with public IP (compute + storage + public IP). */
    rawTotalPricePerHr: withPublicIp,
    rawTotalWithPublicIpPerHr: withPublicIp,
    /** Total with private IP only (compute + storage; private IP = $0). */
    rawTotalWithPrivateIpPerHr: withPrivateIp,
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
 * nestedVirtualization=true → only nested-virt-capable SKUs.
 */
export async function selectProvider({
  canonicalSpec,
  category,
  durationDays,
  specs,
  providers,
  nestedVirtualization = false,
  architecture,
} = {}) {
  const providersUsed = normalizeProviders(providers);
  const days = Number(durationDays) || 0;
  const cat = category || 'linux';
  const pricingMode = toPricingMode(nestedVirtualization);
  const parts = resolveSpecParts(canonicalSpec, specs || {}, cat);
  const spec = parts.canonicalSpec;

  if (days >= 30) {
    return {
      provider: 'webyne',
      region: null,
      category: cat,
      canonicalSpec: spec,
      pricingMode,
      nestedVirtualization: pricingMode === 'nested',
      rawTotalPricePerHr: null,
      autoProvisioned: false,
      reason: 'duration_gte_30_days',
      providersUsed,
    };
  }

  const modeFilter = pricingModeQuery(pricingMode);

  // Always run ensure first so each request prices the requested providers live.
  const dynamicMeta = await ensureSpecPricing({
    canonicalSpec: spec,
    category: cat,
    vcpu: parts.vcpu,
    ramGb: parts.ramGb,
    diskGb: parts.diskGb,
    gpu: parts.gpu,
    providers: providersUsed,
    nestedVirtualization: pricingMode === 'nested',
    architecture,
  });

  const row = await CloudRegionPricing.findOne({
    canonicalSpec: spec,
    category: cat,
    provider: { $in: providersUsed },
    ...modeFilter,
  })
    .sort({ rawTotalPricePerHr: 1 })
    .lean();

  if (!row) {
    return {
      provider: 'webyne',
      region: null,
      category: cat,
      canonicalSpec: spec,
      pricingMode,
      nestedVirtualization: pricingMode === 'nested',
      rawTotalPricePerHr: null,
      autoProvisioned: false,
      reason: 'no_cloud_pricing_for_spec',
      providersUsed,
      dynamicPricing: dynamicMeta,
      architecturePreference: dynamicMeta?.mappings?.architecturePreference,
    };
  }

  const resolvedSkus = buildResolvedSkus(dynamicMeta?.mappings, providersUsed);

  return {
    ...toSelectResult(
      row,
      dynamicMeta
        ? pricingMode === 'nested'
          ? 'cheapest_cloud_nested_dynamic'
          : 'cheapest_cloud_dynamic'
        : pricingMode === 'nested'
          ? 'cheapest_cloud_nested'
          : 'cheapest_cloud',
      providersUsed
    ),
    ...(resolvedSkus ? { resolvedSkus } : {}),
    architecturePreference: dynamicMeta?.architecturePreference
      || dynamicMeta?.mappings?.architecturePreference,
  };
}
