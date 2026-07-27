const axios = require('axios');
const { ensureAzureManagementAccess } = require('../config/azure');
const {
  isVirtualMachineService,
  normalizeVmSize,
  getVmSizeFallbackChain
} = require('../utils/vmSize');
const AppError = require('../utils/AppError');

const CACHE_TTL_MS = 5 * 60 * 1000;
const COMPUTE_SKUS_API_VERSION = '2021-07-01';
const sizeCache = new Map();

const isSkuRestrictedInLocation = (sku, location) => {
  const normalizedLocation = String(location || '').trim().toLowerCase();
  if (!normalizedLocation) {
    return true;
  }

  return (sku.restrictions || []).some((restriction) => {
    const restrictionType = String(restriction?.type || restriction?.restrictionType || '')
      .trim()
      .toLowerCase();

    if (restrictionType && !restrictionType.includes('location')) {
      return false;
    }

    const restrictedLocations = [
      ...(restriction.restrictionInfo?.locations || []),
      ...(restriction.values || [])
    ];

    return restrictedLocations.some(
      (restrictedLocation) =>
        String(restrictedLocation).trim().toLowerCase() === normalizedLocation
    );
  });
};

const isExactVmSizeDeployableInLocation = async (location, instanceOption) => {
  const normalizedLocation = String(location || '').trim().toLowerCase();
  const primarySize = normalizeVmSize(instanceOption);

  if (!normalizedLocation || !primarySize) {
    return false;
  }

  const deployableSizes = await getDeployableVmSizesForLocation(normalizedLocation);
  return deployableSizes.has(primarySize);
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
    const response = await axios.get(nextUrl, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 0
    });

    if (Array.isArray(response.data?.value)) {
      skus.push(...response.data.value);
    }

    nextUrl = response.data?.nextLink || null;
    params = undefined;
  }

  return skus;
};

const getRegionsSupportingVmSize = async (instanceOption) => {
  const primarySize = normalizeVmSize(instanceOption);
  const cacheKey = `vm-regions-exact:${primarySize.toLowerCase()}`;

  const cached = sizeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sizes;
  }

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

  if (candidateRegions.size === 0) {
    sizeCache.set(cacheKey, {
      sizes: candidateRegions,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    return candidateRegions;
  }

  const verifiedRegions = new Set();
  await Promise.all(
    [...candidateRegions].map(async (region) => {
      const deployableSizes = await getDeployableVmSizesForLocation(region);
      if (deployableSizes.has(primarySize)) {
        verifiedRegions.add(region);
      }
    })
  );

  sizeCache.set(cacheKey, {
    sizes: verifiedRegions,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  return verifiedRegions;
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

  const deployableSizes = await getDeployableVmSizesForLocation(normalizedLocation);

  return instances.filter((instance) => {
    const serviceId = Number(instance.serviceId ?? instance.service_id);
    const service = servicesById.get(serviceId);

    if (!isVirtualMachineService(service?.name)) {
      return true;
    }

    const requestedSize = normalizeVmSize(instance.option_name);
    return deployableSizes.has(requestedSize);
  });
};

module.exports = {
  getDeployableVmSizesForLocation,
  getRegionsSupportingVmSize,
  isExactVmSizeDeployableInLocation,
  resolveVmSizeForLocation,
  assertVmSizeAvailableInLocation,
  filterVmInstancesForLocation
};
