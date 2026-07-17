import { GetProductsCommand } from '@aws-sdk/client-pricing';
import { pricingClient } from '../config/aws.js';
import {
  AWS_PRICING_REGIONS,
  AZURE_PRICING_REGIONS,
  awsLocationName,
} from '../config/specMap.js';
import CloudRegionPricing from '../models/CloudRegionPricing.js';
import { ensureSkuMappings } from './dynamicSkuResolver.js';

function extractOnDemandUsd(priceList) {
  if (!priceList?.length) return null;
  try {
    const product = JSON.parse(priceList[0]);
    const onDemand = product.terms?.OnDemand;
    if (!onDemand) return null;
    const term = onDemand[Object.keys(onDemand)[0]];
    const dims = term?.priceDimensions;
    if (!dims) return null;
    const dim = dims[Object.keys(dims)[0]];
    const unitPrice = parseFloat(dim?.pricePerUnit?.USD ?? 'NaN');
    return Number.isFinite(unitPrice) ? unitPrice : null;
  } catch {
    return null;
  }
}

async function fetchEc2Hourly(instanceType, regionCode, os = 'Linux') {
  const location = awsLocationName(regionCode);
  const command = new GetProductsCommand({
    ServiceCode: 'AmazonEC2',
    Filters: [
      { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
      { Type: 'TERM_MATCH', Field: 'location', Value: location },
      { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: os },
      { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
      { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
      { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' },
    ],
    MaxResults: 1,
  });
  const res = await pricingClient.send(command);
  return extractOnDemandUsd(res.PriceList);
}

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

function ebsHourly(ebsGb) {
  return (Number(ebsGb) || 0) * (0.08 / 730);
}
function diskHourly(diskGb) {
  return (Number(diskGb) || 0) * (0.12 / 730);
}

const AWS_IP = 0.005;
const AZURE_IP = 0.004;

/**
 * Ensure CloudRegionPricing has rows for this exact canonicalSpec.
 * Resolves SKUs dynamically when not in the static map, then prices AWS+Azure regions.
 */
export async function ensureSpecPricing({
  canonicalSpec,
  category = 'linux',
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
} = {}) {
  const existing = await CloudRegionPricing.countDocuments({
    canonicalSpec,
    category,
    provider: { $in: ['aws', 'azure'] },
  });
  if (existing > 0) {
    return { cached: true, written: 0, mappings: null };
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

  if (mappings.aws?.instanceType) {
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
          const total = compute + storage + AWS_IP;
          await CloudRegionPricing.findOneAndUpdate(
            { provider: 'aws', region, category: cat, canonicalSpec },
            {
              provider: 'aws',
              region,
              category: cat,
              canonicalSpec,
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: AWS_IP,
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

  if (mappings.azure?.vmSize) {
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

  return {
    cached: false,
    written,
    mappings: {
      aws: mappings.aws,
      azure: mappings.azure,
    },
    errors: errors.slice(0, 30),
    errorCount: errors.length,
  };
}
