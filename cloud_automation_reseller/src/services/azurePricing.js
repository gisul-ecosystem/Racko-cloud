import { azureSpecMap, AZURE_PRICING_REGIONS } from '../config/specMap.js';
import CloudRegionPricing from '../models/CloudRegionPricing.js';

const RETAIL_API = 'https://prices.azure.com/api/retail/prices';

async function fetchRetailPage(filter, skip = 0) {
  const url = new URL(RETAIL_API);
  url.searchParams.set('$filter', filter);
  if (skip > 0) url.searchParams.set('$skip', String(skip));

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Azure Retail Prices HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchVmHourlyUsd(armSkuName, armRegionName) {
  const filter = [
    `serviceName eq 'Virtual Machines'`,
    `armSkuName eq '${armSkuName}'`,
    `armRegionName eq '${armRegionName}'`,
    `priceType eq 'Consumption'`,
    `contains(meterName, 'Spot') eq false`,
    `contains(productName, 'Windows') eq false`,
  ].join(' and ');

  const data = await fetchRetailPage(filter);
  const items = data?.Items || [];
  const match = items.find(
    (i) =>
      i.type === 'Consumption' &&
      typeof i.retailPrice === 'number' &&
      i.unitOfMeasure === '1 Hour'
  );
  return match?.retailPrice ?? null;
}

async function fetchVmWindowsHourlyUsd(armSkuName, armRegionName) {
  const filter = [
    `serviceName eq 'Virtual Machines'`,
    `armSkuName eq '${armSkuName}'`,
    `armRegionName eq '${armRegionName}'`,
    `priceType eq 'Consumption'`,
    `contains(meterName, 'Spot') eq false`,
    `contains(productName, 'Windows') eq true`,
  ].join(' and ');

  const data = await fetchRetailPage(filter);
  const items = data?.Items || [];
  const match = items.find(
    (i) =>
      i.type === 'Consumption' &&
      typeof i.retailPrice === 'number' &&
      i.unitOfMeasure === '1 Hour'
  );
  return match?.retailPrice ?? null;
}

/** Managed disk P10-ish ≈ $0.135/GB-month for premium SSD approximation via diskGb * rate. */
function diskHourly(diskGb) {
  return (Number(diskGb) || 0) * (0.12 / 730);
}

const IP_HOURLY = 0.004;

function categoryForSpec(canonicalSpec) {
  return canonicalSpec.includes('-gpu') ? 'gpu' : 'linux';
}

export async function syncAzurePricing() {
  const now = new Date();
  let written = 0;
  const errors = [];

  for (const [canonicalSpec, mapping] of Object.entries(azureSpecMap)) {
    const category = categoryForSpec(canonicalSpec);
    const categories = category === 'gpu' ? ['gpu'] : ['linux', 'windows'];

    for (const region of AZURE_PRICING_REGIONS) {
      for (const cat of categories) {
        try {
          const compute =
            cat === 'windows'
              ? await fetchVmWindowsHourlyUsd(mapping.vmSize, region)
              : await fetchVmHourlyUsd(mapping.vmSize, region);

          if (compute == null) {
            errors.push(`${canonicalSpec}@${region}/${cat}: no price`);
            continue;
          }

          const storage = diskHourly(mapping.diskGb);
          const ip = IP_HOURLY;
          const total = compute + storage + ip;

          await CloudRegionPricing.findOneAndUpdate(
            {
              provider: 'azure',
              region,
              category: cat,
              canonicalSpec,
            },
            {
              provider: 'azure',
              region,
              category: cat,
              canonicalSpec,
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: ip,
              rawTotalPricePerHr: total,
              currency: 'USD',
              instanceType: mapping.vmSize,
              fetchedAt: now,
              source: 'api',
            },
            { upsert: true, new: true }
          );
          written += 1;
        } catch (err) {
          errors.push(
            `${canonicalSpec}@${region}/${cat}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  return { provider: 'azure', written, errors: errors.slice(0, 20), errorCount: errors.length };
}
