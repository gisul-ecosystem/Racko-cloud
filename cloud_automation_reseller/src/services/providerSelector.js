import CloudRegionPricing, { pricingDiskType, toPricingMode } from '../models/CloudRegionPricing.js';
import {
  AWS_PRICING_REGIONS,
  AZURE_PRICING_REGIONS,
  GCP_PRICING_REGIONS,
  OCI_PRICING_REGIONS,
} from '../config/specMap.js';
import { resolveSpecParts } from '../config/specMap.js';
import { normalizeProviders } from '../config/cloudProviders.js';
import { filterProvisionReadyProviders } from '../config/provisionReady.js';
import { ensureSkuMappings } from './dynamicSkuResolver.js';
import { fetchEc2Hourly, ebsHourly, fetchEbsGbMonth, fetchAwsPublicIpHourly } from './awsPriceFetch.js';
import {
  fetchAzureDiskMonthly,
  fetchAzurePublicIpHourly,
  fetchVmHourlyUsd,
  fetchVmWindowsHourlyUsd,
} from './azurePricing.js';
import { getGcpUnitRates, computeGcpHourly } from './gcpPricing.js';
import { getOciUnitRates, computeOciHourly } from './ociPricing.js';

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

async function fetchLivePricingRows({
  canonicalSpec,
  category,
  mode,
  providersUsed,
  pricingMode,
  parts,
  architecture,
  diskType,
}) {
  const storageOnly = mode === 'storage_only';
  const rows = [];
  const errors = [];
  const mappings = await ensureSkuMappings({
    canonicalSpec,
    vcpu: parts.vcpu,
    ramGb: parts.ramGb,
    diskGb: parts.diskGb,
    gpu: parts.gpu || category === 'gpu',
    nestedVirtualization: pricingMode === 'nested',
    category,
    architecture,
  });
  errors.push(...(mappings.errors || []));

  const jobs = [];

  if (providersUsed.includes('aws')) {
    for (const region of AWS_PRICING_REGIONS) {
      jobs.push(
        (async () => {
          try {
            const ebsGbMonth = await fetchEbsGbMonth(region, diskType);
            const storage = ebsHourly(parts.diskGb, ebsGbMonth);
            if (storageOnly) {
              rows.push({
                provider: 'aws',
                region,
                category,
                canonicalSpec,
                pricingMode,
                rawComputePricePerHr: 0,
                rawStoragePricePerHr: storage,
                rawIpPricePerHr: 0,
                rawTotalPricePerHr: storage,
                currency: 'USD',
                instanceType: null,
                fetchedAt: new Date(),
              });
              return;
            }

            if (!mappings.aws?.instanceType) return;
            const os = category === 'windows' ? 'Windows' : 'Linux';
            const [compute, ipHourly] = await Promise.all([
              fetchEc2Hourly(mappings.aws.instanceType, region, os),
              fetchAwsPublicIpHourly(region),
            ]);
            if (compute == null || !Number.isFinite(compute)) {
              errors.push(`aws ${mappings.aws.instanceType}@${region}/${category}: no compute price`);
              return;
            }
            rows.push({
              provider: 'aws',
              region,
              category,
              canonicalSpec,
              pricingMode,
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: ipHourly,
              rawTotalPricePerHr: compute + storage + ipHourly,
              currency: 'USD',
              instanceType: mappings.aws.instanceType,
              fetchedAt: new Date(),
            });
          } catch (err) {
            errors.push(`aws ${region}: ${err instanceof Error ? err.message : String(err)}`);
          }
        })()
      );
    }
  }

  if (providersUsed.includes('azure')) {
    for (const region of AZURE_PRICING_REGIONS) {
      jobs.push(
        (async () => {
          try {
            const diskMonthly = await fetchAzureDiskMonthly(region, parts.diskGb, diskType);
            const storage = Number(diskMonthly.monthlyPrice) / 730;
            if (storageOnly) {
              rows.push({
                provider: 'azure',
                region,
                category,
                canonicalSpec,
                pricingMode,
                rawComputePricePerHr: 0,
                rawStoragePricePerHr: storage,
                rawIpPricePerHr: 0,
                rawTotalPricePerHr: storage,
                currency: 'USD',
                instanceType: null,
                fetchedAt: new Date(),
              });
              return;
            }

            if (!mappings.azure?.vmSize) return;
            const [compute, ipHourly] = await Promise.all([
              category === 'windows'
                ? fetchVmWindowsHourlyUsd(mappings.azure.vmSize, region)
                : fetchVmHourlyUsd(mappings.azure.vmSize, region),
              fetchAzurePublicIpHourly(region),
            ]);
            if (compute == null || !Number.isFinite(compute)) {
              errors.push(`azure ${mappings.azure.vmSize}@${region}/${category}: no compute price`);
              return;
            }
            rows.push({
              provider: 'azure',
              region,
              category,
              canonicalSpec,
              pricingMode,
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: ipHourly,
              rawTotalPricePerHr: compute + storage + ipHourly,
              currency: 'USD',
              instanceType: mappings.azure.vmSize,
              fetchedAt: new Date(),
            });
          } catch (err) {
            errors.push(`azure ${region}: ${err instanceof Error ? err.message : String(err)}`);
          }
        })()
      );
    }
  }

  if (providersUsed.includes('gcp')) {
    for (const region of GCP_PRICING_REGIONS) {
      jobs.push(
        (async () => {
          try {
            const rates = await getGcpUnitRates(region);
            if (storageOnly) {
              const storageRate =
                diskType === 'standard_hdd' ? rates.pdStandardGbPerMonth : rates.pdBalancedGbPerMonth;
              const storage = (Number(parts.diskGb) || 0) * (storageRate / 730);
              rows.push({
                provider: 'gcp',
                region,
                category,
                canonicalSpec,
                pricingMode,
                rawComputePricePerHr: 0,
                rawStoragePricePerHr: storage,
                rawIpPricePerHr: 0,
                rawTotalPricePerHr: storage,
                currency: 'USD',
                instanceType: null,
                fetchedAt: new Date(),
              });
              return;
            }

            if (!mappings.gcp?.machineType) return;
            const priced = computeGcpHourly({
              machineType: mappings.gcp.machineType,
              diskGb: mappings.gcp.diskGb,
              diskType,
              category,
              acceleratorCount: mappings.gcp.acceleratorCount || 0,
              rates,
            });
            rows.push({
              provider: 'gcp',
              region,
              category,
              canonicalSpec,
              pricingMode,
              ...priced,
              currency: 'USD',
              instanceType: mappings.gcp.machineType,
              fetchedAt: new Date(),
            });
          } catch (err) {
            errors.push(`gcp ${region}: ${err instanceof Error ? err.message : String(err)}`);
          }
        })()
      );
    }
  }

  if (!storageOnly && providersUsed.includes('oci') && mappings.oci?.shape) {
    jobs.push(
      (async () => {
        try {
          const rates = await getOciUnitRates({ shape: mappings.oci.shape });
          for (const region of OCI_PRICING_REGIONS) {
            const priced = computeOciHourly({
              ocpus: mappings.oci.ocpus,
              memoryInGBs: mappings.oci.memoryInGBs,
              bootVolumeGb: mappings.oci.bootVolumeGb,
              category,
              rates,
            });
            rows.push({
              provider: 'oci',
              region,
              category,
              canonicalSpec,
              pricingMode,
              ...priced,
              currency: 'USD',
              instanceType: `${mappings.oci.shape}/${mappings.oci.ocpus}ocpu/${mappings.oci.memoryInGBs}gb`,
              fetchedAt: new Date(),
            });
          }
        } catch (err) {
          errors.push(`oci rates: ${err instanceof Error ? err.message : String(err)}`);
        }
      })()
    );
  }

  await Promise.all(jobs);

  return {
    rows,
    mappings: {
      aws: mappings.aws,
      azure: mappings.azure,
      oci: mappings.oci,
      gcp: mappings.gcp,
      architecturePreference: mappings.architecturePreference,
    },
    architecturePreference: mappings.architecturePreference,
    errors,
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
  architecture,
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

  const provisionReadyProviders = filterProvisionReadyProviders(providersUsed);
  if (provisionReadyProviders.length === 0) {
    return {
      provider: 'webyne',
      region: null,
      category: cat,
      canonicalSpec: spec,
      pricingMode,
      nestedVirtualization: pricingMode === 'nested',
      rawTotalPricePerHr: null,
      autoProvisioned: false,
      reason: 'no_provision_ready_providers',
      providersUsed,
    };
  }

  const dynamicMeta = await fetchLivePricingRows({
    canonicalSpec: spec,
    category: cat,
    mode,
    providersUsed: provisionReadyProviders,
    pricingMode,
    parts,
    architecture,
    diskType: specs?.diskType || 'standard_ssd',
  });

  const sortedRows = [...dynamicMeta.rows].sort(
    mode === 'storage_only'
      ? (a, b) =>
          (Number(a.rawStoragePricePerHr) || Number.MAX_SAFE_INTEGER)
          - (Number(b.rawStoragePricePerHr) || Number.MAX_SAFE_INTEGER)
          || (Number(a.rawTotalPricePerHr) || Number.MAX_SAFE_INTEGER)
          - (Number(b.rawTotalPricePerHr) || Number.MAX_SAFE_INTEGER)
      : (a, b) =>
          (Number(a.rawTotalPricePerHr) || Number.MAX_SAFE_INTEGER)
          - (Number(b.rawTotalPricePerHr) || Number.MAX_SAFE_INTEGER)
  );
  const filteredRows = sortedRows.filter((r) =>
    provisionReadyProviders.includes(r.provider)
  );
  const anomalyFiltered = false;
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
      architecturePreference: dynamicMeta?.mappings?.architecturePreference,
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
        : pricingMode === 'nested'
          ? 'cheapest_cloud_nested_dynamic'
          : 'cheapest_cloud_dynamic',
      providersUsed,
      { storageOnly: mode === 'storage_only' }
    ),
    ...(resolvedSkus ? { resolvedSkus } : {}),
    architecturePreference: dynamicMeta?.architecturePreference
      || dynamicMeta?.mappings?.architecturePreference,
  };
}
