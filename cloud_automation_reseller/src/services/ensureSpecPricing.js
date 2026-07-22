import {
  AWS_PRICING_REGIONS,
  AZURE_PRICING_REGIONS,
  OCI_PRICING_REGIONS,
  GCP_PRICING_REGIONS,
} from '../config/specMap.js';
import CloudRegionPricing from '../models/CloudRegionPricing.js';
import { ensureSkuMappings } from './dynamicSkuResolver.js';
import { getOciUnitRates, computeOciHourly } from './ociPricing.js';
import { getGcpUnitRates, computeGcpHourly } from './gcpPricing.js';
import { normalizeProviders } from '../config/cloudProviders.js';
import { fetchEc2Hourly, ebsHourly, AWS_IP_HOURLY } from './awsPriceFetch.js';

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

function diskHourly(diskGb) {
  return (Number(diskGb) || 0) * (0.12 / 730);
}

const AZURE_IP = 0.004;

async function providersWithPricing(canonicalSpec, category, providers) {
  return CloudRegionPricing.distinct('provider', {
    canonicalSpec,
    category,
    provider: { $in: providers },
  });
}

/**
 * Ensure CloudRegionPricing has rows for this exact canonicalSpec.
 * Resolves SKUs dynamically when not in the static map, then prices requested providers.
 */
export async function ensureSpecPricing({
  canonicalSpec,
  category = 'linux',
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
  providers,
} = {}) {
  const providersUsed = normalizeProviders(providers);
  const existingProviders = await providersWithPricing(
    canonicalSpec,
    category,
    providersUsed
  );
  const missingProviders = providersUsed.filter((p) => !existingProviders.includes(p));
  if (missingProviders.length === 0) {
    return { cached: true, written: 0, mappings: null, providersUsed };
  }

  const mappings = await ensureSkuMappings({
    canonicalSpec,
    vcpu,
    ramGb,
    diskGb,
    gpu: gpu || category === 'gpu',
  });

  const now = new Date();
  let written = 0;
  const errors = [...(mappings.errors || [])];
  const categories =
    category === 'gpu' ? ['gpu'] : category === 'windows' ? ['windows'] : [category];

  if (providersUsed.includes('aws') && mappings.aws?.instanceType) {
    for (const region of AWS_PRICING_REGIONS) {
      for (const cat of categories) {
        try {
          const os = cat === 'windows' ? 'Windows' : 'Linux';
          const compute = await fetchEc2Hourly(mappings.aws.instanceType, region, os);
          if (compute == null) {
            errors.push(`aws ${mappings.aws.instanceType}@${region}/${cat}: no price`);
            continue;
          }
          const storage = ebsHourly(mappings.aws.ebsGb);
          const total = compute + storage + AWS_IP_HOURLY;
          await CloudRegionPricing.findOneAndUpdate(
            { provider: 'aws', region, category: cat, canonicalSpec },
            {
              provider: 'aws',
              region,
              category: cat,
              canonicalSpec,
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: AWS_IP_HOURLY,
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

  if (providersUsed.includes('azure') && mappings.azure?.vmSize) {
    for (const region of AZURE_PRICING_REGIONS) {
      for (const cat of categories) {
        try {
          const compute = await fetchAzureVmHourly(
            mappings.azure.vmSize,
            region,
            cat === 'windows'
          );
          if (compute == null) {
            errors.push(`azure ${mappings.azure.vmSize}@${region}/${cat}: no price`);
            continue;
          }
          const storage = diskHourly(mappings.azure.diskGb);
          const total = compute + storage + AZURE_IP;
          await CloudRegionPricing.findOneAndUpdate(
            { provider: 'azure', region, category: cat, canonicalSpec },
            {
              provider: 'azure',
              region,
              category: cat,
              canonicalSpec,
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: AZURE_IP,
              rawTotalPricePerHr: total,
              currency: 'USD',
              instanceType: mappings.azure.vmSize,
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

  if (providersUsed.includes('oci') && mappings.oci?.shape) {
    let ociRates;
    try {
      ociRates = await getOciUnitRates();
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
              { provider: 'oci', region, category: cat, canonicalSpec },
              {
                provider: 'oci',
                region,
                category: cat,
                canonicalSpec,
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

  if (providersUsed.includes('gcp') && mappings.gcp?.machineType) {
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
            category: cat,
            acceleratorCount: mappings.gcp.acceleratorCount || 0,
            rates: gcpRates,
          });
          await CloudRegionPricing.findOneAndUpdate(
            { provider: 'gcp', region, category: cat, canonicalSpec },
            {
              provider: 'gcp',
              region,
              category: cat,
              canonicalSpec,
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
