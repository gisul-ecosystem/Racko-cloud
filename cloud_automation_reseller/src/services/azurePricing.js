import { azureSpecMap, AZURE_PRICING_REGIONS } from '../config/specMap.js';
import CloudRegionPricing from '../models/CloudRegionPricing.js';

const RETAIL_API = 'https://prices.azure.com/api/retail/prices';

const ancillaryCache = new Map();
const ANCILLARY_TTL_MS = 6 * 60 * 60 * 1000;

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

export async function fetchAzureDiskGbMonth(armRegionName) {
  const key = `disk:${armRegionName}`;
  const hit = ancillaryCache.get(key);
  if (hit && Date.now() - hit.at < ANCILLARY_TTL_MS) return hit.value;

  const filter = [
    `serviceName eq 'Storage'`,
    `armRegionName eq '${armRegionName}'`,
    `priceType eq 'Consumption'`,
    `contains(productName, 'Premium SSD Managed Disks') eq true`,
    `contains(meterName, 'Disk') eq true`,
  ].join(' and ');

  const data = await fetchRetailPage(filter);
  const items = data?.Items || [];
  const perGb = items.find(
    (i) =>
      typeof i.retailPrice === 'number' &&
      /GB/i.test(i.unitOfMeasure || '') &&
      /Premium SSD/i.test(i.productName || '') &&
      !/Snapshot|Mount|Burst/i.test(i.meterName || '')
  );
  let rate = perGb?.retailPrice ?? null;
  if (rate == null) {
    const p10 = items.find(
      (i) =>
        typeof i.retailPrice === 'number' &&
        /P10/i.test(i.meterName || i.skuName || '') &&
        /Month/i.test(i.unitOfMeasure || '')
    );
    if (p10) rate = p10.retailPrice / 128;
  }
  if (rate == null || !Number.isFinite(rate)) {
    throw new Error(`Azure Retail Prices missing Premium SSD GB-month rate for ${armRegionName}`);
  }
  ancillaryCache.set(key, { at: Date.now(), value: rate });
  return rate;
}

export async function fetchAzurePublicIpHourly(armRegionName) {
  const key = `ip:${armRegionName}`;
  const hit = ancillaryCache.get(key);
  if (hit && Date.now() - hit.at < ANCILLARY_TTL_MS) return hit.value;

  const filter = [
    `serviceName eq 'Virtual Network'`,
    `armRegionName eq '${armRegionName}'`,
    `priceType eq 'Consumption'`,
    `contains(productName, 'IP Addresses') eq true`,
  ].join(' and ');

  const data = await fetchRetailPage(filter);
  const items = data?.Items || [];
  const match = items.find(
    (i) =>
      typeof i.retailPrice === 'number' &&
      /Static|Standard/i.test(`${i.meterName || ''} ${i.skuName || ''}`) &&
      /Hour/i.test(i.unitOfMeasure || '') &&
      !/Basic|Dynamic/i.test(i.meterName || '')
  );
  const rate = match?.retailPrice ?? null;
  if (rate == null || !Number.isFinite(rate)) {
    throw new Error(`Azure Retail Prices missing Public IP hourly rate for ${armRegionName}`);
  }
  ancillaryCache.set(key, { at: Date.now(), value: rate });
  return rate;
}

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
      let diskGbMonth;
      let ipHourly;
      try {
        diskGbMonth = await fetchAzureDiskGbMonth(region);
        ipHourly = await fetchAzurePublicIpHourly(region);
      } catch (err) {
        errors.push(
          `ancillary@${region}: ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }

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

          const storage = (Number(mapping.diskGb) || 0) * (diskGbMonth / 730);
          const total = compute + storage + ipHourly;

          await CloudRegionPricing.findOneAndUpdate(
            {
              provider: 'azure',
              region,
              category: cat,
              canonicalSpec,
              pricingMode: 'normal',
            },
            {
              provider: 'azure',
              region,
              category: cat,
              canonicalSpec,
              pricingMode: 'normal',
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: ipHourly,
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
