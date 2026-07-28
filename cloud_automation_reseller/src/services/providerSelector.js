import CloudRegionPricing, {
  pricingDiskType,
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

function storagePerGbMonth(row, diskGb) {
  const storageHourly = Number(row?.rawStoragePricePerHr);
  if (!Number.isFinite(storageHourly) || !Number.isFinite(diskGb) || diskGb <= 0) return null;
  return (storageHourly * 730) / diskGb;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function isStorageRowAnomalous(row, siblingRows, diskGb, deviationThreshold = 0.2) {
  const currentRate = storagePerGbMonth(row, diskGb);
  if (!Number.isFinite(currentRate)) return false;

  const comparableRates = siblingRows
    .map((sibling) => {
      const parts = resolveSpecParts(sibling.canonicalSpec, {}, sibling.category || 'linux');
      if (!parts?.diskGb || parts.diskGb === diskGb) return null;
      return {
        diskGb: parts.diskGb,
        storageHourly: Number(sibling.rawStoragePricePerHr) || 0,
        perGbMonth: storagePerGbMonth(sibling, parts.diskGb),
      };
    })
    .filter((entry) => entry && Number.isFinite(entry.perGbMonth));

  if (comparableRates.length < 2) return false;

  const lowerDiskSizes = comparableRates.filter((entry) => entry.diskGb < diskGb);
  const hasMonotonicViolation = lowerDiskSizes.some(
    (entry) => currentRate < entry.perGbMonth * (1 - deviationThreshold)
      || (Number(row.rawStoragePricePerHr) || 0) < entry.storageHourly
  );
  if (hasMonotonicViolation) return true;

  const baseline = median(comparableRates.map((entry) => entry.perGbMonth));
  if (!Number.isFinite(baseline) || baseline <= 0) return false;
  return Math.abs(currentRate - baseline) / baseline > deviationThreshold;
}

async function filterStorageAnomalies(rows, parts, category, pricingMode, diskType) {
  const evaluated = await Promise.all(
    rows.map(async (row) => {
      const specPattern = new RegExp(
        `^${parts.vcpu}vcpu-${parts.ramGb}gb-\\d+gbssd${parts.gpu ? '-gpu' : ''}$`
      );
      const siblings = await CloudRegionPricing.find({
        provider: row.provider,
        region: row.region,
        category,
        canonicalSpec: specPattern,
        diskType,
        ...pricingModeQuery(pricingMode),
      })
        .select('canonicalSpec rawStoragePricePerHr category')
        .lean();

      return {
        row,
        anomalous: isStorageRowAnomalous(row, siblings, parts.diskGb),
      };
    })
  );

  const filtered = evaluated.filter((entry) => !entry.anomalous).map((entry) => entry.row);
  return {
    rows: filtered.length > 0 ? filtered : rows,
    anomalyFiltered: filtered.length > 0 && filtered.length !== rows.length,
  };
}

/** Map a CloudRegionPricing row into the /api/select payload (incl. public vs private IP). */
export function toSelectResult(row, reason, providersUsed, options = {}) {
  const storageOnly = options.storageOnly === true;
  const compute = storageOnly ? 0 : Number(row.rawComputePricePerHr) || 0;
  const storage = Number(row.rawStoragePricePerHr) || 0;
  const publicIp = storageOnly ? 0 : roundUsdHr(row.rawIpPricePerHr);
  const privateIp = 0; // private NIC/IP is included; not billed separately
  const withPublicIp = storageOnly
    ? roundUsdHr(storage)
    : roundUsdHr(Number(row.rawTotalPricePerHr) || compute + storage + publicIp);
  const withPrivateIp = roundUsdHr(compute + storage + privateIp);

  return {
    provider: row.provider,
    region: row.region,
    category: row.category,
    canonicalSpec: row.canonicalSpec,
    pricingMode: row.pricingMode || 'normal',
    nestedVirtualization: (row.pricingMode || 'normal') === 'nested',
    mode: storageOnly ? 'storage_only' : 'vm',
    rawComputePricePerHr: storageOnly ? 0 : row.rawComputePricePerHr,
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
  mode = 'vm',
  durationDays,
  specs,
  providers,
  nestedVirtualization = false,
} = {}) {
  const requestedProviders = normalizeProviders(providers);
  const providersUsed =
    mode === 'storage_only' && specs?.diskType
      ? requestedProviders.filter((provider) => provider !== 'oci')
      : requestedProviders;
  const days = Number(durationDays) || 0;
  const cat = category || 'linux';
  const pricingMode = toPricingMode(nestedVirtualization);
  const diskType = pricingDiskType(mode, specs?.diskType);
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

  // Always run ensure first so stale/legacy-hardcoded cache rows are refreshed.
  const dynamicMeta = await ensureSpecPricing({
    canonicalSpec: spec,
    category: cat,
    vcpu: parts.vcpu,
    ramGb: parts.ramGb,
    diskGb: parts.diskGb,
    diskType: specs?.diskType,
    gpu: parts.gpu,
    providers: providersUsed,
    nestedVirtualization: pricingMode === 'nested',
  });

  const rows = await CloudRegionPricing.find({
    canonicalSpec: spec,
    category: cat,
    provider: { $in: providersUsed },
    diskType,
    ...modeFilter,
  })
    .sort(mode === 'storage_only' ? { rawStoragePricePerHr: 1, rawTotalPricePerHr: 1 } : { rawTotalPricePerHr: 1 })
    .lean();

  const { rows: filteredRows, anomalyFiltered } =
    mode === 'storage_only'
      ? await filterStorageAnomalies(rows, parts, cat, pricingMode, diskType)
      : { rows, anomalyFiltered: false };
  const row = filteredRows[0];

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
    };
  }

  const resolvedSkus = buildResolvedSkus(dynamicMeta?.mappings, providersUsed);

  return {
    ...toSelectResult(
      row,
      mode === 'storage_only'
        ? anomalyFiltered
          ? 'storage_only_anomaly_filtered'
          : 'storage_only_cheapest'
        : dynamicMeta && !dynamicMeta.cached
          ? pricingMode === 'nested'
            ? 'cheapest_cloud_nested_dynamic'
            : 'cheapest_cloud_dynamic'
          : pricingMode === 'nested'
            ? 'cheapest_cloud_nested'
            : 'cheapest_cloud',
      providersUsed,
      { storageOnly: mode === 'storage_only' }
    ),
    ...(resolvedSkus ? { resolvedSkus } : {}),
  };
}
