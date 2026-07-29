import { azureSpecMap, AZURE_PRICING_REGIONS } from '../config/specMap.js';
import CloudRegionPricing from '../models/CloudRegionPricing.js';

const RETAIL_API = 'https://prices.azure.com/api/retail/prices';

const AZURE_DISK_SKUS = {
  standard_ssd: new Map([
    [32, 'E4'],
    [64, 'E6'],
    [128, 'E10'],
    [256, 'E15'],
    [512, 'E20'],
    [1024, 'E30'],
    [2048, 'E40'],
    [4096, 'E50'],
    [8192, 'E60'],
    [16384, 'E70'],
    [32767, 'E80'],
  ]),
  standard_hdd: new Map([
    [32, 'S4'],
    [64, 'S6'],
    [128, 'S10'],
    [256, 'S15'],
    [512, 'S20'],
    [1024, 'S30'],
    [2048, 'S40'],
    [4096, 'S50'],
    [8192, 'S60'],
    [16384, 'S70'],
    [32767, 'S80'],
  ]),
};

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

function pickAzureVmHourly(items, { windows = false } = {}) {
  const candidates = (items || []).filter((i) => {
    if (i.type !== 'Consumption') return false;
    if (typeof i.retailPrice !== 'number' || !Number.isFinite(i.retailPrice)) return false;
    if (i.unitOfMeasure !== '1 Hour') return false;

    const product = String(i.productName || '');
    const meter = String(i.meterName || '');
    const sku = String(i.skuName || '');
    const blob = `${product} ${meter} ${sku}`;

    if (/Spot|Low Priority|DevTest|Cloud Services/i.test(blob)) return false;
    if (!/Virtual Machines/i.test(product)) return false;

    const isWindows = /Windows/i.test(product);
    if (windows ? !isWindows : isWindows) return false;

    return true;
  });

  // Prefer the exact SKU meter over any leftover variants.
  const exact = candidates.find((i) => !/Low Priority|Spot/i.test(i.meterName || ''));
  return exact?.retailPrice ?? candidates[0]?.retailPrice ?? null;
}

export { pickAzureVmHourly };

export async function fetchVmHourlyUsd(armSkuName, armRegionName) {
  const filter = [
    `serviceName eq 'Virtual Machines'`,
    `armSkuName eq '${armSkuName}'`,
    `armRegionName eq '${armRegionName}'`,
    `priceType eq 'Consumption'`,
    `contains(meterName, 'Spot') eq false`,
    `contains(productName, 'Windows') eq false`,
  ].join(' and ');

  const data = await fetchRetailPage(filter);
  return pickAzureVmHourly(data?.Items || [], { windows: false });
}

export async function fetchVmWindowsHourlyUsd(armSkuName, armRegionName) {
  const filter = [
    `serviceName eq 'Virtual Machines'`,
    `armSkuName eq '${armSkuName}'`,
    `armRegionName eq '${armRegionName}'`,
    `priceType eq 'Consumption'`,
    `contains(meterName, 'Spot') eq false`,
    `contains(productName, 'Windows') eq true`,
  ].join(' and ');

  const data = await fetchRetailPage(filter);
  return pickAzureVmHourly(data?.Items || [], { windows: true });
}

export function resolveAzureDiskSku(diskGb, diskType = 'standard_ssd') {
  const family = AZURE_DISK_SKUS[diskType];
  if (!family) return null;
  const requestedGb = Number(diskGb);
  for (const [tierGb, skuCode] of family.entries()) {
    if (requestedGb <= tierGb) {
      return { skuCode, tierGb };
    }
  }
  return null;
}

export function azureDiskSkuCode(diskGb, diskType = 'standard_ssd') {
  return resolveAzureDiskSku(diskGb, diskType)?.skuCode || null;
}

export async function fetchAzureDiskMonthly(
  armRegionName,
  diskGb,
  diskType = 'standard_ssd'
) {
  const diskFamily =
    diskType === 'standard_hdd'
      ? {
          productName: 'Standard HDD Managed Disks',
          shortName: 'Standard HDD',
        }
      : {
          productName: 'Standard SSD Managed Disks',
          shortName: 'Standard SSD',
        };
  const resolvedSku = resolveAzureDiskSku(diskGb, diskType);
  if (!resolvedSku) {
    throw new Error(
      `Azure Retail Prices has no configured ${diskFamily.shortName} SKU for ${diskGb} GB`
    );
  }
  const { skuCode, tierGb } = resolvedSku;
  const filter = [
    `serviceName eq 'Storage'`,
    `armRegionName eq '${armRegionName}'`,
    `priceType eq 'Consumption'`,
    `contains(productName, '${diskFamily.productName}') eq true`,
    `contains(meterName, 'Disk') eq true`,
  ].join(' and ');

  const data = await fetchRetailPage(filter);
  const items = data?.Items || [];
  const row = items.find(
    (i) =>
      typeof i.retailPrice === 'number' &&
      i.unitOfMeasure === '1/Month' &&
      new RegExp(`^${skuCode}\\s+LRS\\b`, 'i').test(i.meterName || i.skuName || '') &&
      new RegExp(diskFamily.shortName, 'i').test(i.productName || '') &&
      !/Snapshot|Mount|Burst/i.test(i.meterName || '')
  );
  if (!row || !Number.isFinite(row.retailPrice)) {
    throw new Error(
      `Azure Retail Prices missing exact ${skuCode} LRS ${diskFamily.shortName} monthly price for ${armRegionName}`
    );
  }
  const result = {
    monthlyPrice: row.retailPrice,
    skuCode,
    tierGb,
    skuName: row.skuName || null,
    meterName: row.meterName || null,
    productName: row.productName || null,
    armRegionName,
    diskGb: Number(diskGb),
    diskType,
  };
  return result;
}

export async function fetchAzurePublicIpHourly(armRegionName) {
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
      let diskMonthly;
      let ipHourly;
      try {
        diskMonthly = await fetchAzureDiskMonthly(region, mapping.diskGb, 'standard_ssd');
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

          const storage = Number(diskMonthly.monthlyPrice) / 730;
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
