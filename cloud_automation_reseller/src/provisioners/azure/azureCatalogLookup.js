import { ComputeManagementClient } from '@azure/arm-compute';
import { azureConfig, getAzureCredential, validateAzureConfig } from '../../config/azure.js';
import { resolveAzureSku } from '../../services/dynamicSkuResolver.js';
import {
  isAzureImageAvailableInRegion,
  listAzureImageAvailabilityRegions,
} from './azureImageRegions.js';
import { formatAzureImagePlanLabel } from './azureImageSkuLabels.js';
import {
  normalizeAzureRegion,
  parseSkuBlockedLocations,
  skuAvailabilityMessage,
  skuRecordAvailableInRegion,
} from './azureSkuAvailability.js';
import CloudRegionPricing, { pricingModeQuery, toPricingMode } from '../../models/CloudRegionPricing.js';
import { specsToCanonical } from '../../config/specMap.js';
import { resolvePlacementRegionsForAzure } from './azureNetwork.js';

/** @typedef {{ name: string; vcpu: number; memoryGb: number; gpu: boolean; architecture: string; nestedVirtualizationCapable?: boolean }} AzureVmSku */

let azureSkuCache = null;
let azureSkuCacheAt = 0;
let azureSkuLoadPromise = null;
const AZURE_SKU_TTL_MS = 6 * 60 * 60 * 1000;

export function clearAzureVmSkuCache() {
  azureSkuCache = null;
  azureSkuCacheAt = 0;
  azureSkuLoadPromise = null;
}

export function isAzureVmSkuCacheWarm() {
  return Boolean(azureSkuCache && Date.now() - azureSkuCacheAt < AZURE_SKU_TTL_MS);
}

/** Background warm — subscription-wide Resource SKUs scan (slow; single-flight). */
export function warmAzureVmSkuCache() {
  if (isAzureVmSkuCacheWarm()) return Promise.resolve(azureSkuCache);
  if (azureSkuLoadPromise) return azureSkuLoadPromise;
  azureSkuLoadPromise = fetchAzureVmSkusFromApi()
    .catch((err) => {
      console.warn('[azure] VM SKU cache warm failed:', err instanceof Error ? err.message : err);
      return null;
    })
    .finally(() => {
      azureSkuLoadPromise = null;
    });
  return azureSkuLoadPromise;
}

/** Subscription VM SKUs for spec matching — always from live Azure API (cached after first load). */
export async function listAzureVmSkusForMatching() {
  if (isAzureVmSkuCacheWarm()) {
    return { skus: azureSkuCache, source: 'cache' };
  }
  if (azureSkuLoadPromise) {
    const skus = await azureSkuLoadPromise;
    return { skus, source: 'live' };
  }
  const skus = await listAzureVmSkus();
  return { skus, source: isAzureVmSkuCacheWarm() ? 'cache' : 'live' };
}

let imageIndexCache = null;
let imageIndexCacheAt = 0;
const IMAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let imageIndexBuildPromise = null;
const publishersCache = new Map();

function publisherMatchesOsType(publisher, osType) {
  const p = String(publisher).toLowerCase();
  const isWindows =
    p.includes('windows') || p.includes('windowsserver') || p.startsWith('microsoftwindows');
  return osType === 'windows' ? isWindows : !isWindows;
}

function asResourceList(result) {
  return Array.isArray(result) ? result : [];
}

async function listPublishersInRegion(client, location) {
  const cached = publishersCache.get(location);
  if (cached && Date.now() - cached.at < IMAGE_CACHE_TTL_MS) {
    return cached.names;
  }
  const publishers = await client.virtualMachineImages.listPublishers(location);
  const names = asResourceList(publishers)
    .map((row) => row?.name)
    .filter(Boolean);
  publishersCache.set(location, { at: Date.now(), names });
  return names;
}

async function appendPublisherImages(client, location, publisher, index, { query, maxRows }) {
  if (index.length >= maxRows) return;
  const q = String(query || '').trim().toLowerCase();

  try {
    const offers = await client.virtualMachineImages.listOffers(location, publisher);
    for (const offer of asResourceList(offers)) {
      if (index.length >= maxRows) return;
      const offerName = offer.name || '';
      try {
        const skus = await client.virtualMachineImages.listSkus(location, publisher, offerName);
        for (const sku of asResourceList(skus)) {
          if (index.length >= maxRows) return;
          const skuName = sku.name || '';
          const label = `${publisher} / ${offerName} / ${skuName}`;
          const searchText = label.toLowerCase();
          if (q && !searchText.includes(q)) continue;
          index.push({
            publisher,
            offer: offerName,
            sku: skuName,
            label,
            searchText,
          });
        }
      } catch {
        /* offer may be unavailable in region */
      }
    }
  } catch {
    /* publisher may be unavailable in region or subscription */
  }
}

function resolveRequiredRegion(region, label = 'region') {
  const location = String(region || '').trim() || String(azureConfig.location || '').trim();
  if (!location) {
    throw Object.assign(
      new Error(`${label} is required. Select a region or set AZURE_LOCATION in reseller env.`),
      { statusCode: 400 }
    );
  }
  return location;
}

function azureArchitectureFromSku(_sku, caps) {
  const archCap = String(
    caps.CpuArchitectureType || caps.CPUArchitectureType || caps.ArchitectureType || ''
  ).toLowerCase();
  if (/arm/.test(archCap)) return 'arm64';
  if (/x64|x86/.test(archCap)) return 'x86_64';
  return 'x86_64';
}

function azureNestedVirtualizationCapable(caps) {
  const hyperV = String(caps.HyperVGenerations || '').trim();
  return Boolean(hyperV && /V1|V2/i.test(hyperV));
}

function wrapAzureApiError(err, action = 'Azure API call') {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid_client|AADSTS7000215|client secret/i.test(msg)) {
    throw Object.assign(
      new Error(
        'Azure authentication failed: check AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET (use the secret value, not the secret ID).'
      ),
      { statusCode: 503 }
    );
  }
  throw Object.assign(new Error(`${action} failed: ${msg}`), { statusCode: 502 });
}

export async function listAzureVmSkus({ refresh = false } = {}) {
  if (!refresh && isAzureVmSkuCacheWarm()) {
    return azureSkuCache;
  }
  if (!refresh && azureSkuLoadPromise) {
    return azureSkuLoadPromise;
  }

  azureSkuLoadPromise = fetchAzureVmSkusFromApi().finally(() => {
    azureSkuLoadPromise = null;
  });
  return azureSkuLoadPromise;
}

function mergeAzureVmSkuRecords(existing, incoming) {
  const locations = [
    ...new Set([...(existing.locations || []), ...(incoming.locations || [])]),
  ];
  const blockedLocations = { ...(existing.blockedLocations || {}) };
  for (const [loc, reasons] of Object.entries(incoming.blockedLocations || {})) {
    blockedLocations[loc] = [
      ...new Set([...(blockedLocations[loc] || []), ...(reasons || [])]),
    ];
  }
  return {
    name: existing.name,
    vcpu: existing.vcpu,
    memoryGb: existing.memoryGb,
    gpu: Boolean(existing.gpu || incoming.gpu),
    architecture: existing.architecture || incoming.architecture,
    nestedVirtualizationCapable: Boolean(
      existing.nestedVirtualizationCapable || incoming.nestedVirtualizationCapable
    ),
    locations,
    blockedLocations,
  };
}

/** Azure returns the same VM size many times (per region/zone) — one row per name. */
function dedupeAzureVmSkusByName(rows) {
  const byName = new Map();
  for (const row of rows) {
    const key = String(row.name || '').toLowerCase();
    if (!key) continue;
    const prev = byName.get(key);
    byName.set(key, prev ? mergeAzureVmSkuRecords(prev, row) : { ...row });
  }
  return [...byName.values()];
}

async function fetchAzureVmSkusFromApi() {
  if (!azureConfig.subscriptionId) {
    throw Object.assign(new Error('AZURE_SUBSCRIPTION_ID not set'), { statusCode: 503 });
  }

  try {
    const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);
    const out = [];
    for await (const sku of client.resourceSkus.list()) {
      if (sku.resourceType !== 'virtualMachines') continue;
      if (sku.restrictions?.some((r) => r.reasonCode === 'NotAvailableForSubscription' && r.type !== 'Location')) {
        continue;
      }

      const caps = Object.fromEntries((sku.capabilities || []).map((c) => [c.name, c.value]));
      const vcpu = Number(caps.vCPUs || caps.NumberOfCores || 0);
      const memoryGb = Number(caps.MemoryGB || 0);
      const gpu = Number(caps.GPUs || 0) > 0;
      if (!vcpu || !memoryGb) continue;

      const locations = [
        ...(sku.locationInfo || []).map((li) => li.location).filter(Boolean),
      ];
      if (locations.length === 0 && Array.isArray(sku.locations)) {
        locations.push(...sku.locations.filter(Boolean));
      }

      out.push({
        name: sku.name,
        vcpu,
        memoryGb,
        gpu,
        architecture: azureArchitectureFromSku(sku, caps),
        nestedVirtualizationCapable: azureNestedVirtualizationCapable(caps),
        locations,
        blockedLocations: parseSkuBlockedLocations(sku),
      });
    }

    const deduped = dedupeAzureVmSkusByName(out);
    azureSkuCache = deduped;
    azureSkuCacheAt = Date.now();
    return deduped;
  } catch (err) {
    wrapAzureApiError(err, 'Listing Azure VM SKUs');
  }
}

export async function searchAzureVmSkus({ query = '', limit = 30 } = {}) {
  validateAzureConfig();
  const skus = await listAzureVmSkus();
  const q = String(query || '').trim().toLowerCase();
  let filtered = skus;
  if (q) {
    filtered = skus.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        String(s.vcpu).includes(q) ||
        String(s.memoryGb).includes(q)
    );
  }
  return filtered
    .slice(0, Math.min(Math.max(Number(limit) || 30, 1), 100))
    .map((s) => ({
      name: s.name,
      vcpu: s.vcpu,
      memoryGb: s.memoryGb,
      architecture: s.architecture,
      gpu: s.gpu,
    }));
}

export async function validateAzureVmSpec({
  vmSize,
  vcpu,
  ramGb,
  ssdGb,
  nestedVirtualization = false,
  category = 'linux',
} = {}) {
  validateAzureConfig();

  const diskGb = Math.max(8, Number(ssdGb) || 50);
  const sizeQuery = String(vmSize || '').trim();

  if (sizeQuery) {
    const skus = await listAzureVmSkus();
    const found = skus.find((s) => s.name.toLowerCase() === sizeQuery.toLowerCase());
    if (!found) {
      return { valid: false, message: `VM size "${sizeQuery}" is not available for this subscription.` };
    }
    return {
      valid: true,
      vmSize: found.name,
      vcpu: found.vcpu,
      memoryGb: found.memoryGb,
      diskGb,
      architecture: found.architecture,
      gpu: found.gpu,
    };
  }

  const needVcpu = Number(vcpu);
  const needRam = Number(ramGb);
  if (!Number.isFinite(needVcpu) || needVcpu < 1 || !Number.isFinite(needRam) || needRam < 1) {
    return { valid: false, message: 'Enter a VM size or vCPU and RAM values.' };
  }

  const resolved = await resolveAzureSku({
    vcpu: needVcpu,
    ramGb: needRam,
    diskGb,
    nestedVirtualization: Boolean(nestedVirtualization),
    category,
  });

  if (!resolved?.vmSize) {
    return { valid: false, message: 'No Azure VM size matches this vCPU/RAM/disk spec.' };
  }

  return {
    valid: true,
    vmSize: resolved.vmSize,
    vcpu: needVcpu,
    memoryGb: needRam,
    diskGb: resolved.diskGb || diskGb,
    architecture: resolved.architecture || null,
    gpu: /gpu/i.test(String(category || '')),
  };
}

/**
 * Live check: VM size exists for subscription and is not blocked in the target region.
 */
export async function validateAzureVmSizeInRegion({
  vmSize,
  region,
  refresh = false,
} = {}) {
  validateAzureConfig();

  const sizeQuery = String(vmSize || '').trim();
  const regionQuery = String(region || '').trim();
  if (!sizeQuery || !regionQuery) {
    return { valid: false, message: 'VM size and region are required for availability check.' };
  }

  const skus = await listAzureVmSkus({ refresh });
  const found = skus.find((s) => s.name.toLowerCase() === sizeQuery.toLowerCase());
  if (!found) {
    return {
      valid: false,
      message: `VM size "${sizeQuery}" is not offered for this Azure subscription.`,
    };
  }

  if (!skuRecordAvailableInRegion(found, regionQuery)) {
    return {
      valid: false,
      message:
        skuAvailabilityMessage(found, regionQuery) ||
        `${found.name} is not available in ${regionQuery}.`,
    };
  }

  return {
    valid: true,
    vmSize: found.name,
    region: normalizeAzureRegion(regionQuery),
    vcpu: found.vcpu,
    memoryGb: found.memoryGb,
  };
}

/**
 * Pre-provision quote: SKU availability in region + cached pricing (+ optional image check).
 */
export async function validateAzureProvisionQuote({
  vmSize,
  region,
  vcpu,
  ramGb,
  ssdGb,
  category = 'linux',
  nestedVirtualization = false,
  assignPublicIp = false,
  imagePublisher,
  imageOffer,
  imageSku,
  customImageId,
} = {}) {
  validateAzureConfig();

  const normRegion = normalizeAzureRegion(region);
  const { regions: allowedRegions } = await resolvePlacementRegionsForAzure({
    assignPublicIp,
    regionFilter: normRegion,
  });
  if (!allowedRegions.some((r) => normalizeAzureRegion(r) === normRegion)) {
    return {
      valid: false,
      message: assignPublicIp
        ? `Region "${region}" is not available in this Azure subscription.`
        : `Private IP VMs must deploy in ${azureConfig.location} where ${azureConfig.vnetName} exists.`,
    };
  }

  const availability = await validateAzureVmSizeInRegion({
    vmSize,
    region,
    refresh: false,
  });
  if (!availability.valid) {
    return availability;
  }

  const needVcpu = Number(vcpu) || availability.vcpu;
  const needRam = Number(ramGb) || availability.memoryGb;
  const diskGb = Math.max(8, Number(ssdGb) || 50);
  const gpu = /gpu/i.test(String(category || ''));
  const windows = /windows/i.test(String(category || ''));
  const priceCategory = gpu ? 'gpu' : windows ? 'windows' : 'linux';
  const pricingMode = toPricingMode(Boolean(nestedVirtualization));
  const canonicalSpec = specsToCanonical(
    { cpu: needVcpu, ram: needRam, disk: diskGb },
    gpu ? 'gpu' : category
  );

  const pub = String(imagePublisher || '').trim();
  const off = String(imageOffer || '').trim();
  const imgSku = String(imageSku || '').trim();
  if (pub && off && imgSku) {
    const imageRegions = await listAzureImageAvailabilityRegions({
      publisher: pub,
      offer: off,
      sku: imgSku,
      regions: [normRegion],
    });
    if (
      imageRegions.length === 0 ||
      !imageRegions.some((r) => normalizeAzureRegion(r) === normRegion)
    ) {
      return {
        valid: false,
        message: `Image ${pub}/${off}/${imgSku} is not available in ${region}.`,
      };
    }
  }

  if (customImageId?.trim()) {
    const custom = await validateAzureCustomImage({
      imageId: customImageId.trim(),
      region: normRegion,
    });
    if (!custom.valid) {
      return { valid: false, message: custom.message || 'Invalid custom template for this region.' };
    }
  }

  const row = await CloudRegionPricing.findOne({
    provider: 'azure',
    region: normRegion,
    category: priceCategory,
    canonicalSpec,
    ...pricingModeQuery(pricingMode),
    instanceType: availability.vmSize,
  }).lean();

  const compute = Number(row?.rawComputePricePerHr) || 0;
  const storage = Number(row?.rawStoragePricePerHr) || 0;
  const ip = assignPublicIp ? Number(row?.rawIpPricePerHr) || 0 : 0;
  const estimatedHourlyUsd = compute + storage + ip;

  return {
    valid: true,
    vmSize: availability.vmSize,
    region: normRegion,
    canonicalSpec,
    vcpu: needVcpu,
    memoryGb: needRam,
    estimatedHourlyUsd: estimatedHourlyUsd > 0 ? estimatedHourlyUsd : null,
    message: `Ready to provision ${availability.vmSize} in ${region}.`,
  };
}

async function buildImageIndex(location, { osType = 'linux', query = '', limit = 50 } = {}) {
  const cacheKey = `${location}:${osType}:${String(query).trim().toLowerCase()}:${limit}`;
  if (imageIndexCache?.key === cacheKey && Date.now() - imageIndexCacheAt < IMAGE_CACHE_TTL_MS) {
    return imageIndexCache.rows;
  }
  if (imageIndexBuildPromise?.key === cacheKey) {
    return imageIndexBuildPromise.promise;
  }

  const buildPromise = (async () => {
    if (!azureConfig.subscriptionId) {
      throw Object.assign(new Error('AZURE_SUBSCRIPTION_ID not set'), { statusCode: 503 });
    }

    const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);
    const normalizedOs = String(osType).toLowerCase() === 'windows' ? 'windows' : 'linux';
    const maxRows = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const q = String(query || '').trim().toLowerCase();

    const allPublishers = await listPublishersInRegion(client, location);
    let publishers = allPublishers.filter((name) => publisherMatchesOsType(name, normalizedOs));

    if (q) {
      const direct = publishers.filter((name) => name.toLowerCase().includes(q));
      publishers = direct.length > 0 ? direct : publishers;
    }

    // Windows publishers are few; Linux has many — cap publisher fan-out for responsiveness.
    const publisherCap = normalizedOs === 'windows' ? 20 : q ? 25 : 15;
    publishers = publishers.slice(0, publisherCap);

    const index = [];
    for (const publisher of publishers) {
      await appendPublisherImages(client, location, publisher, index, { query: q, maxRows });
      if (index.length >= maxRows) break;
    }

    imageIndexCache = { key: cacheKey, rows: index };
    imageIndexCacheAt = Date.now();
    return index;
  })();

  imageIndexBuildPromise = { key: cacheKey, promise: buildPromise };

  try {
    return await buildPromise;
  } catch (err) {
    wrapAzureApiError(err, 'Building Azure marketplace image index');
  } finally {
    if (imageIndexBuildPromise?.key === cacheKey) {
      imageIndexBuildPromise = null;
    }
  }
}

export async function searchAzureVmImages({ query = '', region, osType, limit = 25 } = {}) {
  validateAzureConfig();
  const location = resolveRequiredRegion(region, 'region');
  const max = Math.min(Math.max(Number(limit) || 25, 1), 100);
  return buildImageIndex(location, { osType, query, limit: max });
}

export async function validateAzureImage({
  publisher,
  offer,
  sku,
  region,
  version = 'latest',
} = {}) {
  validateAzureConfig();

  const pub = String(publisher || '').trim();
  const off = String(offer || '').trim();
  const skuName = String(sku || '').trim();
  if (!pub || !off || !skuName) {
    return { valid: false, message: 'publisher, offer, and sku are required.' };
  }

  const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);
  const requestedRegion = String(region || '').trim();
  let regionsToCheck = requestedRegion
    ? [requestedRegion]
    : [azureConfig.location];

  const availableRegions = [];
  for (const location of regionsToCheck) {
    if (await isAzureImageAvailableInRegion(client, location, pub, off, skuName)) {
      availableRegions.push(location);
    }
  }

  if (!requestedRegion && availableRegions.length === 0) {
    return {
      valid: false,
      message: `Image not available in any configured pricing region (${regionsToCheck.join(', ')}).`,
    };
  }

  if (requestedRegion && availableRegions.length === 0) {
    const others = await listAzureImageAvailabilityRegions({
      publisher: pub,
      offer: off,
      sku: skuName,
    });
    return {
      valid: false,
      message: `Image not found in region ${requestedRegion}.${
        others.length ? ` Available in: ${others.join(', ')}.` : ''
      }`,
      availableRegions: others,
    };
  }

  const location = requestedRegion || availableRegions[0];
  const versions = [];
  try {
    const rows = await client.virtualMachineImages.list(location, pub, off, skuName);
    for (const row of asResourceList(rows)) {
      if (row.name) versions.push(row.name);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, message: `Image not found in ${location}: ${message}` };
  }

  if (versions.length === 0) {
    return { valid: false, message: `Image not found in region ${location}.` };
  }

  const sorted = [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const requested = String(version || 'latest').trim();
  const resolvedVersion =
    requested === 'latest' ? sorted[0] : versions.includes(requested) ? requested : null;

  if (!resolvedVersion) {
    return {
      valid: false,
      message: `Version "${requested}" is not available for this image.`,
      availableVersions: sorted.slice(0, 10),
    };
  }

  return {
    valid: true,
    publisher: pub,
    offer: off,
    sku: skuName,
    version: resolvedVersion,
    region: location,
    availableRegions,
    label: formatAzureImagePlanLabel({ publisher: pub, offer: off, sku: skuName }),
    availableVersions: sorted.slice(0, 10),
  };
}

function parseResourceGroupFromId(id) {
  const match = String(id || '').match(/resourceGroups\/([^/]+)/i);
  return match?.[1] || null;
}

export async function searchAzureCustomImages({ query = '', limit = 50, resourceGroup } = {}) {
  validateAzureConfig();
  if (!azureConfig.subscriptionId) {
    throw Object.assign(new Error('AZURE_SUBSCRIPTION_ID not set'), { statusCode: 503 });
  }

  const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);
  const q = String(query || '').trim().toLowerCase();
  const rgFilter = String(
    resourceGroup || azureConfig.templateResourceGroup || ''
  )
    .trim()
    .toLowerCase();
  const rows = [];

  try {
    const managedImages = rgFilter
      ? client.images.listByResourceGroup(rgFilter)
      : client.images.list();
    for await (const img of managedImages) {
    const imgRg = parseResourceGroupFromId(img.id)?.toLowerCase() || '';
    const osType = img.storageProfile?.osDisk?.osType || 'Unknown';
    const label = `${img.name} (${img.location}, ${osType})`;
    const searchText = `${img.name} ${img.location} ${osType} ${imgRg} managed`.toLowerCase();
    if (q && !searchText.includes(q)) continue;
    rows.push({
      id: img.id,
      name: img.name,
      resourceGroup: parseResourceGroupFromId(img.id),
      location: img.location,
      osType,
      label,
      source: 'managed',
    });
  }

  const galleries = rgFilter
    ? client.galleries.listByResourceGroup(rgFilter)
    : client.galleries.list();
  for await (const gallery of galleries) {
    const galleryRg =
      parseResourceGroupFromId(gallery.id) || gallery.resourceGroup || '';
    if (rgFilter && String(galleryRg).toLowerCase() !== rgFilter) continue;

    for await (const image of client.galleryImages.listByGallery(galleryRg, gallery.name)) {
      let latestVersion = null;
      let versionId = null;
      for await (const version of client.galleryImageVersions.listByGalleryImage(
        galleryRg,
        gallery.name,
        image.name
      )) {
        if (
          !latestVersion ||
          String(version.name).localeCompare(latestVersion, undefined, { numeric: true }) > 0
        ) {
          latestVersion = version.name;
          versionId = version.id;
        }
      }
      if (!versionId) continue;

      const osType = image.osType || 'Unknown';
      const label = `${gallery.name}/${image.name} (${image.location || gallery.location}, ${osType})`;
      const searchText =
        `${gallery.name} ${image.name} ${osType} ${galleryRg} gallery`.toLowerCase();
      if (q && !searchText.includes(q)) continue;

      rows.push({
        id: versionId,
        name: `${gallery.name}/${image.name}`,
        resourceGroup: galleryRg,
        location: image.location || gallery.location,
        osType,
        label,
        source: 'gallery',
        version: latestVersion,
      });
    }
  }

  rows.sort((a, b) => a.label.localeCompare(b.label));
  return rows.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
  } catch (err) {
    wrapAzureApiError(err, 'Listing Azure custom templates');
  }
}

export async function validateAzureCustomImage({ imageId, region } = {}) {
  validateAzureConfig();
  const id = String(imageId || '').trim();
  if (!id) {
    return { valid: false, message: 'imageId is required.' };
  }

  const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);
  const targetRegion = String(region || azureConfig.location || '').trim();

  try {
    const galleryMatch = id.match(
      /resourceGroups\/([^/]+)\/providers\/Microsoft\.Compute\/galleries\/([^/]+)\/images\/([^/]+)\/versions\/([^/]+)/i
    );
    if (galleryMatch) {
      const [, rg, galleryName, imageName, versionName] = galleryMatch;
      const version = await client.galleryImageVersions.get(
        rg,
        galleryName,
        imageName,
        versionName
      );
      if (targetRegion && version.location && version.location !== targetRegion) {
        return {
          valid: false,
          message: `Template is in ${version.location}; pick region ${version.location} or choose another image.`,
        };
      }
      const osType = version.storageProfile?.osDisk?.osType || 'Unknown';
      return {
        valid: true,
        id: version.id || id,
        label: `${galleryName}/${imageName}@${versionName}`,
        osType,
        location: version.location,
        source: 'gallery',
      };
    }

    const rg = parseResourceGroupFromId(id);
    const name = id.split('/').pop();
    if (!rg || !name) {
      return { valid: false, message: 'Invalid managed image resource id.' };
    }
    const img = await client.images.get(rg, name);
    if (targetRegion && img.location && img.location !== targetRegion) {
      return {
        valid: false,
        message: `Template is in ${img.location}; pick region ${img.location} or choose another image.`,
      };
    }
    const osType = img.storageProfile?.osDisk?.osType || 'Unknown';
    return {
      valid: true,
      id: img.id || id,
      label: img.name,
      osType,
      location: img.location,
      source: 'managed',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, message: `Custom image not found: ${message}` };
  }
}
