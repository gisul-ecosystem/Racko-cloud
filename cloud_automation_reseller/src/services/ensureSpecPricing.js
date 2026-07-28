import {
  AWS_PRICING_REGIONS,
  AZURE_PRICING_REGIONS,
  OCI_PRICING_REGIONS,
  GCP_PRICING_REGIONS,
} from '../config/specMap.js';
import CloudRegionPricing, {
  pricingDiskType,
  toPricingMode,
  pricingModeQuery,
} from '../models/CloudRegionPricing.js';
import { ensureSkuMappings } from './dynamicSkuResolver.js';
import { getOciUnitRates, computeOciHourly } from './ociPricing.js';
import { getGcpUnitRates, computeGcpHourly } from './gcpPricing.js';
import { normalizeProviders } from '../config/cloudProviders.js';
import {
  fetchEc2Hourly,
  ebsHourly,
  fetchEbsGbMonth,
  fetchAwsPublicIpHourly,
} from './awsPriceFetch.js';
import { fetchAzureDiskMonthly, fetchAzurePublicIpHourly } from './azurePricing.js';

const RETAIL_API = 'https://prices.azure.com/api/retail/prices';

async function fetchAzureVmHourly(armSkuName, armRegionName, windows = false) {
  const filter = [
    `serviceName eq 'Virtual Machines'`,
    `armSkuName eq '${armSkuName}'`,
    `armRegionName eq '${armRegionName}'`,
    `priceType eq 'Consumption'`,
    `contains(meterName, 'Spot') eq false`,
    windows
      ? `contains(productName, 'Windows') eq true`
      : `contains(productName, 'Windows') eq false`,
  ].join(' and ');

  const url = new URL(RETAIL_API);
  url.searchParams.set('$filter', filter);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Azure Retail Prices HTTP ${res.status}`);
  const data = await res.json();
  const items = data?.Items || [];
  const match = items.find(
    (i) =>
      i.type === 'Consumption' &&
      typeof i.retailPrice === 'number' &&
      i.unitOfMeasure === '1 Hour'
  );
  return match?.retailPrice ?? null;
}

/** Pre-live-API Azure constant — never a current Retail IP rate we observed. */
const LEGACY_AZURE_IP = 0.004;
/** Pre-live-API Azure Premium SSD approximation ($/GB-month). */
const LEGACY_AZURE_DISK_GB_MONTH = 0.12;

const PRICING_CACHE_MAX_AGE_MS =
  Number(process.env.PRICING_CACHE_MAX_AGE_MS) || 6 * 60 * 60 * 1000;

function isStalePricingRow(row, diskGb) {
  if (!row?.fetchedAt) return true;
  if (Date.now() - new Date(row.fetchedAt).getTime() > PRICING_CACHE_MAX_AGE_MS) {
    return true;
  }
  // Old Azure path wrote IP=0.004 and storage = diskGb * 0.12/730.
  if (row.provider === 'azure' && row.rawIpPricePerHr === LEGACY_AZURE_IP) return true;
  if (row.provider === 'azure' && diskGb != null) {
    const legacyStorage = Number(diskGb) * (LEGACY_AZURE_DISK_GB_MONTH / 730);
    if (
      Number.isFinite(row.rawStoragePricePerHr) &&
      Math.abs(row.rawStoragePricePerHr - legacyStorage) < 1e-12
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Providers that still need a live re-price for this spec.
 */
async function providersNeedingPricing(
  canonicalSpec,
  category,
  providers,
  pricingMode,
  diskGb,
  diskType
) {
  const rows = await CloudRegionPricing.find({
    canonicalSpec,
    category,
    provider: { $in: providers },
    diskType,
    ...pricingModeQuery(pricingMode),
  })
    .select('provider fetchedAt rawIpPricePerHr rawStoragePricePerHr')
    .lean();

  return providers.filter((p) => {
    const mine = rows.filter((r) => r.provider === p);
    if (mine.length === 0) return true;
    return mine.some((r) => isStalePricingRow(r, diskGb));
  });
}

/**
 * Ensure CloudRegionPricing has rows for this exact canonicalSpec + pricingMode.
 * Resolves SKUs dynamically when not in the static map, then prices requested providers.
 * All unit rates come from live provider price APIs — no hardcoded fallbacks.
 * Re-fetches when cache is missing, older than PRICING_CACHE_MAX_AGE_MS, or still
 * carrying known legacy Azure hardcodes (IP 0.004 / disk 0.12).
 */
export async function ensureSpecPricing({
  canonicalSpec,
  category = 'linux',
  mode = 'vm',
  vcpu,
  ramGb,
  diskGb,
  diskType = 'standard_ssd',
  gpu = false,
  providers,
  nestedVirtualization = false,
} = {}) {
  const providersUsed = normalizeProviders(providers);
  const pricingMode = toPricingMode(nestedVirtualization);
  // VM quotes must use diskType "default"; storage-only quotes use standard_ssd/hdd.
  // Do NOT infer storage_only from the diskType string alone — that broke VM calculator
  // lookups (writes went to standard_ssd while selectProvider queried default).
  const quoteMode = mode === 'storage_only' ? 'storage_only' : 'vm';
  const pricingDisk = pricingDiskType(quoteMode, diskType);
  const storageOnly = quoteMode === 'storage_only';
  const missingProviders = await providersNeedingPricing(
    canonicalSpec,
    category,
    providersUsed,
    pricingMode,
    diskGb,
    pricingDisk
  );
  if (missingProviders.length === 0) {
    return { cached: true, written: 0, mappings: null, providersUsed, pricingMode };
  }

  const mappings = await ensureSkuMappings({
    canonicalSpec,
    vcpu,
    ramGb,
    diskGb,
    gpu: gpu || category === 'gpu',
    nestedVirtualization: pricingMode === 'nested',
  });

  const now = new Date();
  let written = 0;
  const errors = [...(mappings.errors || [])];
  const categories =
    category === 'gpu' ? ['gpu'] : category === 'windows' ? ['windows'] : [category];
  const shouldPrice = (p) => missingProviders.includes(p);

  if (shouldPrice('aws') && mappings.aws?.instanceType) {
    for (const region of AWS_PRICING_REGIONS) {
      let ebsGbMonth;
      let ipHourly;
      try {
        ebsGbMonth = await fetchEbsGbMonth(region, diskType);
        ipHourly = await fetchAwsPublicIpHourly(region);
      } catch (err) {
        errors.push(`aws ancillary ${region}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      for (const cat of categories) {
        try {
          const os = cat === 'windows' ? 'Windows' : 'Linux';
          const compute = await fetchEc2Hourly(mappings.aws.instanceType, region, os);
          if (compute == null) {
            errors.push(`aws ${mappings.aws.instanceType}@${region}/${cat}: no price`);
            continue;
          }
          const storage = ebsHourly(mappings.aws.ebsGb, ebsGbMonth);
          const total = compute + storage + ipHourly;
          await CloudRegionPricing.findOneAndUpdate(
            { provider: 'aws', region, category: cat, canonicalSpec, pricingMode, diskType: pricingDisk },
            {
              provider: 'aws',
              region,
              category: cat,
              canonicalSpec,
              pricingMode,
              diskType: pricingDisk,
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: ipHourly,
              rawTotalPricePerHr: total,
              currency: 'USD',
              instanceType: mappings.aws.instanceType,
              fetchedAt: now,
              source: 'api',
            },
            { upsert: true, new: true }
          );
          written += 1;
        } catch (err) {
          errors.push(
            `aws ${region}/${cat}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  if (shouldPrice('azure') && (storageOnly || mappings.azure?.vmSize)) {
    for (const region of AZURE_PRICING_REGIONS) {
      let diskMonthly;
      let ipHourly;
      try {
        diskMonthly = await fetchAzureDiskMonthly(region, diskGb, diskType);
        ipHourly = storageOnly ? 0 : await fetchAzurePublicIpHourly(region);
      } catch (err) {
        errors.push(
          `azure ancillary ${region}: ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
      for (const cat of categories) {
        try {
          let compute = 0;
          let instanceType = null;
          if (!storageOnly) {
            compute = await fetchAzureVmHourly(
              mappings.azure.vmSize,
              region,
              cat === 'windows'
            );
            if (compute == null) {
              errors.push(`azure ${mappings.azure.vmSize}@${region}/${cat}: no price`);
              continue;
            }
            instanceType = mappings.azure.vmSize;
          }
          const storage = Number(diskMonthly.monthlyPrice) / 730;
          const total = compute + storage + ipHourly;
          await CloudRegionPricing.findOneAndUpdate(
            { provider: 'azure', region, category: cat, canonicalSpec, pricingMode, diskType: pricingDisk },
            {
              provider: 'azure',
              region,
              category: cat,
              canonicalSpec,
              pricingMode,
              diskType: pricingDisk,
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: ipHourly,
              rawTotalPricePerHr: total,
              currency: 'USD',
              ...(instanceType ? { instanceType } : {}),
              fetchedAt: now,
              source: 'api',
            },
            { upsert: true, new: true }
          );
          written += 1;
        } catch (err) {
          errors.push(
            `azure ${region}/${cat}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  if (shouldPrice('oci') && mappings.oci?.shape) {
    let ociRates;
    try {
      ociRates = await getOciUnitRates({ shape: mappings.oci.shape });
    } catch (err) {
      errors.push(`oci rates: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (ociRates) {
      for (const region of OCI_PRICING_REGIONS) {
        for (const cat of categories) {
          try {
            const priced = computeOciHourly({
              ocpus: mappings.oci.ocpus,
              memoryInGBs: mappings.oci.memoryInGBs,
              bootVolumeGb: mappings.oci.bootVolumeGb,
              category: cat,
              rates: ociRates,
            });
            await CloudRegionPricing.findOneAndUpdate(
              { provider: 'oci', region, category: cat, canonicalSpec, pricingMode, diskType: pricingDisk },
              {
                provider: 'oci',
                region,
                category: cat,
                canonicalSpec,
                pricingMode,
                diskType: pricingDisk,
                ...priced,
                currency: 'USD',
                instanceType: `${mappings.oci.shape}/${mappings.oci.ocpus}ocpu/${mappings.oci.memoryInGBs}gb`,
                fetchedAt: now,
                source: 'api',
              },
              { upsert: true, new: true }
            );
            written += 1;
          } catch (err) {
            errors.push(
              `oci ${region}/${cat}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    }
  }

  if (shouldPrice('gcp') && mappings.gcp?.machineType) {
    for (const region of GCP_PRICING_REGIONS) {
      let gcpRates;
      try {
        gcpRates = await getGcpUnitRates(region);
      } catch (err) {
        errors.push(`gcp rates ${region}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      for (const cat of categories) {
        try {
          const priced = computeGcpHourly({
            machineType: mappings.gcp.machineType,
            diskGb: mappings.gcp.diskGb,
            diskType,
            category: cat,
            acceleratorCount: mappings.gcp.acceleratorCount || 0,
            rates: gcpRates,
          });
          await CloudRegionPricing.findOneAndUpdate(
            { provider: 'gcp', region, category: cat, canonicalSpec, pricingMode, diskType: pricingDisk },
            {
              provider: 'gcp',
              region,
              category: cat,
              canonicalSpec,
              pricingMode,
              diskType: pricingDisk,
              ...priced,
              currency: 'USD',
              instanceType: mappings.gcp.machineType,
              fetchedAt: now,
              source: 'api',
            },
            { upsert: true, new: true }
          );
          written += 1;
        } catch (err) {
          errors.push(
            `gcp ${region}/${cat}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  return {
    cached: false,
    written,
    providersUsed,
    pricingMode,
    mappings: {
      aws: mappings.aws,
      azure: mappings.azure,
      oci: mappings.oci,
      gcp: mappings.gcp,
    },
    errors: errors.slice(0, 30),
    errorCount: errors.length,
  };
}
