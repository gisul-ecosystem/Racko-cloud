import { validateAzureConfig, azureConfig } from '../../config/azure.js';
import { specsToCanonical } from '../../config/specMap.js';
import { resolvePlacementRegionsForAzure } from './azureNetwork.js';
import { shortlistAzureSkusForSpec } from '../../services/dynamicSkuResolver.js';
import { listAzureImageAvailabilityRegions } from './azureImageRegions.js';
import { listAzureVmSkus } from './azureCatalogLookup.js';
import { skuRecordAvailableInRegion, normalizeAzureRegion } from './azureSkuAvailability.js';
import CloudRegionPricing, { pricingModeQuery, toPricingMode } from '../../models/CloudRegionPricing.js';
import {
  fetchVmHourlyUsd,
  fetchVmWindowsHourlyUsd,
  fetchAzureDiskMonthly,
  fetchAzurePublicIpHourly,
} from '../../services/azurePricing.js';

function skuAvailableInRegion(sku, region) {
  return skuRecordAvailableInRegion(sku, region);
}

async function filterPlacementOptionsByAvailability(options, skuByName) {
  if (!options.length) return options;

  let skuMap = skuByName;
  if (!skuMap?.size) {
    const skus = await listAzureVmSkus();
    skuMap = new Map(skus.map((s) => [s.name, s]));
  }

  return options.filter((opt) => {
    const sku = skuMap.get(opt.vmSize);
    if (!sku) return false;
    return skuRecordAvailableInRegion(sku, opt.region);
  });
}

async function finalizePlacementOptions(
  options,
  skuByName,
  emptyMessage,
  { cheapestRegionOnly = false, maxOptions = 0 } = {}
) {
  const filtered = await filterPlacementOptionsByAvailability(options, skuByName);
  let resultOptions = filtered;
  if (cheapestRegionOnly && filtered.length > 0) {
    const cheapestRegion = sortPlacementOptions(filtered)[0].region;
    resultOptions = filtered.filter((opt) => opt.region === cheapestRegion);
  }
  const sorted = sortPlacementOptions(resultOptions);
  const limited = maxOptions > 0 ? sorted.slice(0, maxOptions) : sorted;
  return {
    options: limited,
    message:
      limited.length === 0
        ? emptyMessage ||
          'No VM sizes with confirmed Azure availability for this spec and region. Try different vCPU/RAM or another region.'
        : undefined,
  };
}

function sortPlacementOptions(options) {
  return [...options].sort(
    (a, b) =>
      a.estimatedHourlyUsd - b.estimatedHourlyUsd ||
      a.region.localeCompare(b.region) ||
      a.vmSize.localeCompare(b.vmSize)
  );
}

function buildOptionsFromDbRows(dbRows, { needVcpu, needRam, assignPublicIp, skuByName }) {
  return dbRows
    .map((row) => {
      const sku = skuByName?.get(row.instanceType);
      const compute = Number(row.rawComputePricePerHr) || 0;
      const storage = Number(row.rawStoragePricePerHr) || 0;
      const ip = assignPublicIp ? Number(row.rawIpPricePerHr) || 0 : 0;
      return {
        region: row.region,
        vmSize: row.instanceType,
        vcpu: sku?.vcpu ?? needVcpu,
        memoryGb: sku?.memoryGb ?? needRam,
        estimatedHourlyUsd: compute + storage + ip,
        estimatedComputeHourlyUsd: compute,
        estimatedStorageHourlyUsd: storage,
        estimatedIpHourlyUsd: ip,
      };
    })
    .filter((row) => row.vmSize);
}

async function runPool(taskFns, limit = 8) {
  const results = [];
  for (let i = 0; i < taskFns.length; i += limit) {
    const chunk = taskFns.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map((fn) => fn()));
    results.push(...chunkResults);
  }
  return results;
}

async function queryCachedAzurePricing({
  canonicalSpec,
  priceCategory,
  pricingMode,
  regionsToPrice,
}) {
  return CloudRegionPricing.find({
    provider: 'azure',
    canonicalSpec,
    category: priceCategory,
    ...pricingModeQuery(pricingMode),
    region: { $in: regionsToPrice },
  }).lean();
}

/** Public-IP quotes need multi-region cache; default sync only covers AZURE_LOCATION. */
function shouldTrustCachedPublicPlacement(dbRows, regionsToPrice, assignPublic) {
  if (!assignPublic) return dbRows.length > 0;
  const cachedRegions = new Set(
    dbRows.map((row) => normalizeAzureRegion(row.region)).filter(Boolean)
  );
  const minRequired = Math.min(
    Math.max(Number(process.env.AZURE_PUBLIC_PLACEMENT_MIN_CACHED_REGIONS) || 12, 4),
    regionsToPrice.length
  );
  return cachedRegions.size >= minRequired;
}

const PRIORITY_CHEAP_AZURE_REGIONS = [
  'eastus',
  'eastus2',
  'westus2',
  'westus3',
  'centralus',
  'southcentralus',
  'northcentralus',
  'westcentralus',
  'centralindia',
  'southindia',
  'westindia',
  'southeastasia',
  'eastasia',
  'northeurope',
  'westeurope',
  'uksouth',
  'australiaeast',
];

function prioritizePublicPricingRegions(allRegions, homeRegion, max) {
  const normalized = allRegions.map((r) => normalizeAzureRegion(r));
  const available = new Set(normalized);
  const home = normalizeAzureRegion(homeRegion);
  const ordered = [];
  for (const region of [home, ...PRIORITY_CHEAP_AZURE_REGIONS]) {
    if (available.has(region) && !ordered.includes(region)) ordered.push(region);
  }
  for (const region of normalized) {
    if (!ordered.includes(region)) ordered.push(region);
  }
  return ordered.slice(0, Math.max(max, 1));
}

function filterDbRowsToCandidates(dbRows, candidates) {
  if (!candidates?.length) return dbRows;
  const allowed = new Set(candidates.map((c) => String(c.name || '').toLowerCase()));
  return dbRows.filter((row) =>
    allowed.has(String(row.instanceType || '').toLowerCase())
  );
}

async function tryCachedPlacementOptions({
  dbRows,
  candidates,
  regionsToPrice,
  needVcpu,
  needRam,
  assignPublicIp,
  assignPublic,
  canonicalSpec,
  homeRegion,
  emptyMessage,
}) {
  if (
    !dbRows.length ||
    !shouldTrustCachedPublicPlacement(dbRows, regionsToPrice, assignPublic)
  ) {
    return null;
  }
  const skuByName = new Map(candidates.map((s) => [s.name, s]));
  const options = sortPlacementOptions(
    buildOptionsFromDbRows(dbRows, { needVcpu, needRam, assignPublicIp, skuByName })
  );
  if (options.length === 0) return null;

  const result = await finalizePlacementOptions(
    options,
    skuByName,
    emptyMessage,
    placementFinalizeOptions(assignPublic)
  );
  if (result.options.length === 0) return null;

  const comparedRegions = new Set(result.options.map((o) => o.region)).size;
  return buildPlacementResponse({
    options: result.options,
    canonicalSpec,
    message:
      result.message ||
      (assignPublic
        ? `Compared ${comparedRegions} region(s) from pricing cache.`
        : `Priced in ${homeRegion} from cache.`),
    assignPublicIp: assignPublic,
    homeRegion,
  });
}

function placementFinalizeOptions(assignPublic) {
  if (assignPublic) {
    return {
      cheapestRegionOnly: false,
      maxOptions: Math.max(Number(process.env.AZURE_PUBLIC_PLACEMENT_MAX_OPTIONS) || 25, 5),
    };
  }
  return { cheapestRegionOnly: false };
}

async function loadRegionAncillaryCosts(regions, diskGb, assignPublic) {
  const map = new Map();
  await runPool(
    regions.map((region) => async () => {
      let storage = 0;
      let ip = 0;
      try {
        const diskMonthly = await fetchAzureDiskMonthly(region, diskGb);
        storage = Number(diskMonthly.monthlyPrice) / 730;
      } catch {
        storage = 0;
      }
      if (assignPublic) {
        try {
          ip = Number(await fetchAzurePublicIpHourly(region)) || 0;
        } catch {
          ip = 0;
        }
      }
      map.set(region, { storage, ip });
    }),
    10
  );
  return map;
}

const placementInFlight = new Map();

function buildPlacementResponse({
  options,
  canonicalSpec,
  message,
  assignPublicIp,
  homeRegion,
}) {
  const sorted = sortPlacementOptions(options);
  const assignPublic = Boolean(assignPublicIp);
  return {
    options: sorted,
    total: sorted.length,
    canonicalSpec,
    message,
    homeRegion: homeRegion || normalizeAzureRegion(azureConfig.location),
    regionMode: assignPublic ? 'auto' : 'home',
    assignPublicIp: assignPublic,
    recommended: sorted[0] ?? null,
  };
}

/**
 * List priced region + VM SKU pairs that satisfy the requested spec.
 * Private IP → home region only. Public IP → cheapest subscription region (auto).
 */
export async function listAzurePlacementOptions(params = {}) {
  const key = JSON.stringify(params);
  if (placementInFlight.has(key)) {
    return placementInFlight.get(key);
  }
  const promise = listAzurePlacementOptionsInner(params).finally(() => {
    placementInFlight.delete(key);
  });
  placementInFlight.set(key, promise);
  return promise;
}

async function listAzurePlacementOptionsInner({
  vcpu,
  ramGb,
  ssdGb,
  category = 'linux',
  nestedVirtualization = false,
  assignPublicIp = false,
  region,
  imagePublisher,
  imageOffer,
  imageSku,
} = {}) {
  validateAzureConfig();

  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const diskGb = Math.max(8, Number(ssdGb) || 50);
  const gpu = /gpu/i.test(String(category || ''));
  const windows = /windows/i.test(String(category || ''));
  const canonicalSpec = specsToCanonical(
    { cpu: needVcpu, ram: needRam, disk: diskGb },
    gpu ? 'gpu' : category
  );
  const homeRegion = normalizeAzureRegion(azureConfig.location);
  const assignPublic = Boolean(assignPublicIp);
  const pricingMode = toPricingMode(nestedVirtualization);
  const priceCategory = gpu ? 'gpu' : windows ? 'windows' : 'linux';
  const priceFn = windows ? fetchVmWindowsHourlyUsd : fetchVmHourlyUsd;

  const regionFilter = String(region || '')
    .trim()
    .toLowerCase();

  if (!assignPublic && regionFilter && regionFilter !== homeRegion) {
    return buildPlacementResponse({
      options: [],
      canonicalSpec,
      message: `Private IP VMs must deploy in the home region (${azureConfig.location}). Enable public IP to use ${regionFilter}.`,
      assignPublicIp: false,
      homeRegion,
    });
  }

  const { regions: placementRegions } = await resolvePlacementRegionsForAzure({
    assignPublicIp: assignPublic,
    regionFilter,
  });
  let regionsToPrice = regionFilter
    ? placementRegions.filter((r) => r.toLowerCase() === regionFilter)
    : [...placementRegions];

  const maxLiveRegions = Math.max(
    1,
    Number(process.env.AZURE_PUBLIC_PLACEMENT_MAX_REGIONS) || 16
  );

  if (regionFilter && regionsToPrice.length === 0) {
    return buildPlacementResponse({
      options: [],
      canonicalSpec,
      message: assignPublic
        ? `Region "${region}" is not available in this Azure subscription.`
        : `Private IP VMs must use ${azureConfig.location}.`,
      assignPublicIp: assignPublic,
      homeRegion,
    });
  }

  const pub = String(imagePublisher || '').trim();
  const off = String(imageOffer || '').trim();
  const skuName = String(imageSku || '').trim();
  let imageRegionCount = 0;

  // Fast path: use Mongo pricing cache before image checks or live Azure pricing calls.
  let dbRows = await queryCachedAzurePricing({
    canonicalSpec,
    priceCategory,
    pricingMode,
    regionsToPrice,
  });

  if (pub && off && skuName) {
    let imageCheckRegions;
    if (assignPublic) {
      imageCheckRegions = prioritizePublicPricingRegions(regionsToPrice, homeRegion, maxLiveRegions);
    } else if (dbRows.length > 0) {
      imageCheckRegions = [...new Set(dbRows.map((row) => row.region).filter(Boolean))];
    } else {
      imageCheckRegions = [homeRegion];
    }

    try {
      const imageRegions = await listAzureImageAvailabilityRegions({
        publisher: pub,
        offer: off,
        sku: skuName,
        regions: imageCheckRegions,
      });
      if (imageRegions.length === 0) {
        // Last resort: home region only (image was validated in wizard step 3).
        const homeOnly = await listAzureImageAvailabilityRegions({
          publisher: pub,
          offer: off,
          sku: skuName,
          regions: [homeRegion],
        });
        if (homeOnly.length === 0) {
          return buildPlacementResponse({
            options: [],
            canonicalSpec,
            message: `Image ${pub}/${off}/${skuName} is not available in ${homeRegion}. Pick another image or region.`,
            assignPublicIp: assignPublic,
            homeRegion,
          });
        }
        regionsToPrice = assignPublic
          ? prioritizePublicPricingRegions(homeOnly, homeRegion, maxLiveRegions)
          : homeOnly;
        imageRegionCount = homeOnly.length;
      } else {
        imageRegionCount = imageRegions.length;
        const allowed = new Set(imageRegions.map((r) => r.toLowerCase()));
        regionsToPrice = regionsToPrice.filter((r) => allowed.has(r.toLowerCase()));
        if (regionsToPrice.length === 0) {
          regionsToPrice = imageRegions;
        }
      }
      if (dbRows.length > 0) {
        const allowed = new Set(regionsToPrice.map((r) => normalizeAzureRegion(r).toLowerCase()));
        dbRows = dbRows.filter((row) =>
          allowed.has(normalizeAzureRegion(String(row.region || '')).toLowerCase())
        );
      }
    } catch (err) {
      console.warn(
        '[azure] Image region check failed — continuing with prioritized pricing regions:',
        err instanceof Error ? err.message : err
      );
      if (assignPublic) {
        regionsToPrice = prioritizePublicPricingRegions(regionsToPrice, homeRegion, maxLiveRegions);
      } else {
        regionsToPrice = [homeRegion];
      }
    }
  }

  const candidates = await shortlistAzureSkusForSpec({
    vcpu: needVcpu,
    ramGb: needRam,
    diskGb,
    gpu,
    nestedVirtualization: Boolean(nestedVirtualization),
    category,
  });

  if (candidates.length === 0) {
    const nestedHint = nestedVirtualization
      ? ' Nested virtualization requires Intel/AMD sizes with Hyper-V support — try fewer vCPUs/RAM or disable nested virt.'
      : '';
    return buildPlacementResponse({
      options: [],
      canonicalSpec,
      message: `No Azure VM sizes match this vCPU/RAM configuration.${nestedHint}`,
      assignPublicIp: assignPublic,
      homeRegion,
    });
  }

  dbRows = filterDbRowsToCandidates(dbRows, candidates);

  const availabilityEmptyMessage = assignPublic
    ? 'Pricing exists but Azure reports no available VM capacity for this spec in the configured regions. Try a smaller size.'
    : `No VM sizes with confirmed availability in ${homeRegion} for this spec. Try different vCPU/RAM${nestedVirtualization ? ' or disable nested virtualization' : ''}.`;

  const cachedEarly = await tryCachedPlacementOptions({
    dbRows,
    candidates,
    regionsToPrice,
    needVcpu,
    needRam,
    assignPublicIp,
    assignPublic,
    canonicalSpec,
    homeRegion,
    emptyMessage: availabilityEmptyMessage,
  });
  if (cachedEarly) return cachedEarly;

  // Private IP: live retail pricing in home region is faster than ensureSpecPricing (multi-provider sync).
  if (dbRows.length === 0 && !assignPublic) {
    dbRows = await queryCachedAzurePricing({
      canonicalSpec,
      priceCategory,
      pricingMode,
      regionsToPrice,
    });
    dbRows = filterDbRowsToCandidates(dbRows, candidates);
  }

  const cachedAfterEnsure = await tryCachedPlacementOptions({
    dbRows,
    candidates,
    regionsToPrice,
    needVcpu,
    needRam,
    assignPublicIp,
    assignPublic,
    canonicalSpec,
    homeRegion,
    emptyMessage: availabilityEmptyMessage,
  });
  if (cachedAfterEnsure) return cachedAfterEnsure;

  let regionsForLivePricing = regionsToPrice;
  if (assignPublic) {
    regionsForLivePricing = prioritizePublicPricingRegions(
      regionsToPrice,
      homeRegion,
      maxLiveRegions
    );
  } else if (regionsForLivePricing.length > maxLiveRegions) {
    regionsForLivePricing = prioritizePublicPricingRegions(
      regionsToPrice,
      homeRegion,
      maxLiveRegions
    );
  } else if (!assignPublic) {
    regionsForLivePricing = [homeRegion];
  }

  const maxPricingSkus = Math.min(
    Math.max(Number(process.env.AZURE_PLACEMENT_MAX_SKUS) || 3, 1),
    candidates.length
  );
  const pricingCandidates = candidates.slice(0, maxPricingSkus);
  const regionAncillary = await loadRegionAncillaryCosts(
    regionsForLivePricing,
    diskGb,
    assignPublic
  );

  const jobs = [];

  for (const sku of pricingCandidates) {
    for (const pricingRegion of regionsForLivePricing) {
      if (!skuAvailableInRegion(sku, pricingRegion)) continue;
      jobs.push(async () => {
        try {
          const compute = await priceFn(sku.name, pricingRegion);
          if (compute == null || !Number.isFinite(compute)) return null;

          const ancillary = regionAncillary.get(pricingRegion) || { storage: 0, ip: 0 };
          const storage = ancillary.storage;
          const ip = assignPublic ? ancillary.ip : 0;
          const hourly = compute + storage + ip;

          return {
            region: pricingRegion,
            vmSize: sku.name,
            vcpu: sku.vcpu,
            memoryGb: sku.memoryGb,
            estimatedHourlyUsd: hourly,
            estimatedComputeHourlyUsd: compute,
            estimatedStorageHourlyUsd: storage,
            estimatedIpHourlyUsd: ip,
          };
        } catch {
          return null;
        }
      });
    }
  }

  const priced = sortPlacementOptions((await runPool(jobs, 8)).filter(Boolean));
  const skuByName = new Map(candidates.map((s) => [s.name, s]));
  const result = await finalizePlacementOptions(
    priced,
    skuByName,
    imageRegionCount > 0
      ? `Image is available in ${imageRegionCount} priced region(s) but no VM size has confirmed Azure availability for this spec (${windows ? 'Windows' : 'Linux'}, ${needVcpu} vCPU, ${needRam} GB RAM). Try different specs.`
      : 'No priced Azure region/SKU combinations with confirmed availability found for this spec.',
    placementFinalizeOptions(assignPublic)
  );

  const comparedRegions = new Set(result.options.map((o) => o.region)).size;
  return buildPlacementResponse({
    options: result.options,
    canonicalSpec,
    message:
      result.message ||
      (assignPublic && result.options.length > 0
        ? `Live Azure retail pricing across ${comparedRegions} region(s) — recommended is lowest total (compute + disk + public IP).`
        : undefined),
    assignPublicIp: assignPublic,
    homeRegion,
  });
}
