const axios = require('axios');
const { ensureAzureManagementAccess } = require('../config/azure');
const {
  isVirtualMachineService,
  normalizeVmSize,
  getVmSizeFallbackChain
} = require('../utils/vmSize');
const AppError = require('../utils/AppError');

const CACHE_TTL_MS = 15 * 60 * 1000;
const COMPUTE_SKUS_API_VERSION = '2021-07-01';
const AZURE_SKU_HTTP_TIMEOUT_MS = 20_000;
const AZURE_SKU_MAX_ATTEMPTS = 2;
const sizeCache = new Map();
const sizeInflight = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isSkuRestrictedInLocation = (sku, location) => {
  const normalizedLocation = String(location || '').trim().toLowerCase();
  if (!normalizedLocation) {
    return true;
  }

  return (sku.restrictions || []).some((restriction) => {
    const restrictionType = String(restriction?.type || restriction?.restrictionType || '')
      .trim()
      .toLowerCase();
    const reasonCode = String(restriction?.reasonCode || '')
      .trim()
      .toLowerCase();

    const restrictedLocations = [
      ...(restriction.restrictionInfo?.locations || []),
      ...(restriction.values || [])
    ]
      .map((restrictedLocation) => String(restrictedLocation || '').trim().toLowerCase())
      .filter(Boolean);

    const appliesToLocation =
      restrictedLocations.length === 0
        ? reasonCode.includes('notavailable')
        : restrictedLocations.includes(normalizedLocation);

    if (!appliesToLocation) {
      return false;
    }

    // Location-scoped blocks (including NotAvailableForSubscription).
    if (restrictionType.includes('location') || reasonCode.includes('notavailable')) {
      return true;
    }

    return false;
  });
};

const isExactVmSizeDeployableInLocation = async (location, instanceOption) => {
  const normalizedLocation = String(location || '').trim().toLowerCase();
  const primarySize = normalizeVmSize(instanceOption);

  if (!normalizedLocation || !primarySize) {
    return false;
  }

  // Same source as available-locations filtering so create + UI never disagree.
  const regions = await getRegionsSupportingVmSize(primarySize);
  return regions.has(normalizedLocation);
};

const collectRegionsFromSku = (sku, regions) => {
  if (sku.resourceType !== 'virtualMachines') {
    return;
  }

  for (const listedLocation of sku.locations || []) {
    const normalizedLocation = String(listedLocation || '').trim().toLowerCase();
    if (!normalizedLocation || isSkuRestrictedInLocation(sku, normalizedLocation)) {
      continue;
    }

    regions.add(normalizedLocation);
  }
};

const listComputeSkusByFilter = async ({ accessToken, subscriptionId, filter }) => {
  const skus = [];
  let nextUrl = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Compute/skus`;
  let params = {
    'api-version': COMPUTE_SKUS_API_VERSION,
    $filter: filter
  };

  while (nextUrl) {
    let lastError = null;
    let response = null;

    for (let attempt = 1; attempt <= AZURE_SKU_MAX_ATTEMPTS; attempt += 1) {
      try {
        response = await axios.get(nextUrl, {
          params,
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: AZURE_SKU_HTTP_TIMEOUT_MS
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const retriable =
          !error?.response &&
          /ECONNRESET|ETIMEDOUT|ECONNABORTED|socket hang up|timeout/i.test(
            String(error?.message || error?.code || '')
          );

        if (!retriable || attempt >= AZURE_SKU_MAX_ATTEMPTS) {
          throw error;
        }

        await sleep(400 * attempt);
      }
    }

    if (!response) {
      throw lastError || new Error('Failed to list compute SKUs.');
    }

    if (Array.isArray(response.data?.value)) {
      skus.push(...response.data.value);
    }

    nextUrl = response.data?.nextLink || null;
    params = undefined;
  }

  return skus;
};

/**
 * Regions where a VM size is offered (Compute Resource SKUs API).
 * Uses the SKU locations + location restrictions directly — no per-region
 * fan-out (that was causing multi-minute timeouts / ECONNRESET).
 */
const getRegionsSupportingVmSize = async (instanceOption) => {
  const primarySize = normalizeVmSize(instanceOption);
  const cacheKey = `vm-regions-exact:${primarySize.toLowerCase()}`;

  const cached = sizeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sizes;
  }

  const inflight = sizeInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const fetchPromise = (async () => {
    const { token, subscriptionId } = await ensureAzureManagementAccess();
    const candidateRegions = new Set();

    const skus = await listComputeSkusByFilter({
      accessToken: token.token,
      subscriptionId,
      filter: `name eq '${primarySize}'`
    });

    for (const sku of skus) {
      collectRegionsFromSku(sku, candidateRegions);
    }

    sizeCache.set(cacheKey, {
      sizes: candidateRegions,
      expiresAt: Date.now() + CACHE_TTL_MS
    });

    return candidateRegions;
  })();

  sizeInflight.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    sizeInflight.delete(cacheKey);
  }
};

const getDeployableVmSizesForLocation = async (location) => {
  const normalizedLocation = String(location || '').trim().toLowerCase();

  if (!normalizedLocation) {
    return new Set();
  }

  const cached = sizeCache.get(normalizedLocation);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sizes;
  }

  const inflightKey = `vm-sizes-location:${normalizedLocation}`;
  const inflight = sizeInflight.get(inflightKey);
  if (inflight) {
    return inflight;
  }

  const fetchPromise = (async () => {
    const { token, subscriptionId } = await ensureAzureManagementAccess();
    const skus = await listComputeSkusByFilter({
      accessToken: token.token,
      subscriptionId,
      filter: `location eq '${normalizedLocation}'`
    });

    const sizes = new Set();

    for (const sku of skus) {
      if (sku.resourceType !== 'virtualMachines' || !sku.name) {
        continue;
      }

      const isListedForLocation = (sku.locations || []).some(
        (listedLocation) => String(listedLocation).trim().toLowerCase() === normalizedLocation
      );

      if (!isListedForLocation || isSkuRestrictedInLocation(sku, normalizedLocation)) {
        continue;
      }

      sizes.add(sku.name);
    }

    sizeCache.set(normalizedLocation, {
      sizes,
      expiresAt: Date.now() + CACHE_TTL_MS
    });

    return sizes;
  })();

  sizeInflight.set(inflightKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    sizeInflight.delete(inflightKey);
  }
};

const resolveVmSizeForLocation = async (location, instanceOption) => {
  const normalizedLocation = String(location || '').trim().toLowerCase();
  const candidates = getVmSizeFallbackChain(instanceOption);
  const deployableSizes = await getDeployableVmSizesForLocation(normalizedLocation);

  for (const candidate of candidates) {
    if (deployableSizes.has(candidate)) {
      return candidate;
    }
  }

  const requestedSize = normalizeVmSize(instanceOption);
  const sampleSizes = [...deployableSizes]
    .filter((name) => /^Standard_B/i.test(name))
    .slice(0, 5)
    .join(', ');

  throw new AppError(
    `VM size ${requestedSize} is not available in ${normalizedLocation}.` +
      (sampleSizes ? ` Try one of: ${sampleSizes}.` : ' Choose another size or region.'),
    400
  );
};

const assertVmSizeAvailableInLocation = async (location, instanceOption) =>
  resolveVmSizeForLocation(location, instanceOption);

const filterVmInstancesForLocation = async (location, instances, servicesById) => {
  const normalizedLocation = String(location || '').trim().toLowerCase();

  if (!normalizedLocation || instances.length === 0) {
    return instances;
  }

  const hasVmInstances = instances.some((instance) => {
    const service = servicesById.get(Number(instance.serviceId ?? instance.service_id));
    return isVirtualMachineService(service?.name);
  });

  if (!hasVmInstances) {
    return instances;
  }

  const checks = await Promise.all(
    instances.map(async (instance) => {
      const serviceId = Number(instance.serviceId ?? instance.service_id);
      const service = servicesById.get(serviceId);

      if (!isVirtualMachineService(service?.name)) {
        return instance;
      }

      const requestedSize = normalizeVmSize(instance.option_name);
      const regions = await getRegionsSupportingVmSize(requestedSize);
      return regions.has(normalizedLocation) ? instance : null;
    })
  );

  return checks.filter(Boolean);
};

module.exports = {
  getDeployableVmSizesForLocation,
  getRegionsSupportingVmSize,
  isExactVmSizeDeployableInLocation,
  resolveVmSizeForLocation,
  assertVmSizeAvailableInLocation,
  filterVmInstancesForLocation
};
