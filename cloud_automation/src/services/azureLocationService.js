const axios = require('axios');
const db = require('../db/postgres');
const { ensureAzureManagementAccess } = require('../config/azure');
const {
  getRegionalHourlyPricesForServices,
  getPortalHourlyFees,
  getServiceRegionalHourlyPrices,
  intersectRegionalPriceMaps
} = require('./estimatePricingService');
const AppError = require('../utils/AppError');
const {
  buildAzureNetworkErrorMessage,
  extractAzureErrorDetails,
  isAzureNetworkError,
  logAzureEvent
} = require('../utils/azureLogger');

const LOG_SERVICE = 'azure-locations';
const CACHE_TTL_MS = 5 * 60 * 1000;
const subscriptionLocationsCache = {
  expiresAt: 0,
  locations: []
};
const catalogRegionsCache = {
  expiresAt: 0,
  byServiceName: new Map()
};

const normalizeServiceName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^azure\s+/, '');

const isProvisionableLocation = (location) => {
  const armRegionName = String(location?.arm_region_name || location?.name || '')
    .trim()
    .toLowerCase();
  const displayLocation = String(location?.display_location || location?.displayName || '').trim();

  if (!armRegionName) {
    return false;
  }

  // Staging, preview, and EUAP regions appear in subscription listings but cannot host resource groups.
  if (
    /stage|euap|preview/i.test(armRegionName) ||
    /stg$/i.test(armRegionName) ||
    /\(stage\)|\(stg\)|\(preview\)/i.test(displayLocation)
  ) {
    return false;
  }

  const regionType = String(location?.metadata?.regionType || '').trim();
  if (regionType === 'Logical') {
    return false;
  }

  return true;
};

const assertProvisionableLocation = (location) => {
  const armRegionName = String(location || '').trim().toLowerCase();

  if (!armRegionName) {
    throw new AppError('Request location is missing.', 400);
  }

  if (!isProvisionableLocation({ arm_region_name: armRegionName })) {
    throw new AppError(
      `Region '${armRegionName}' is a preview/stage region and cannot host resource groups. Choose a production region such as eastasia, southeastasia, or centralindia.`,
      400
    );
  }
};

const mapAzureNetworkError = (error) => {
  if (isAzureNetworkError(error)) {
    return new AppError(buildAzureNetworkErrorMessage(), 503);
  }

  return error;
};

const getManagementAccessToken = async () => {
  logAzureEvent(LOG_SERVICE, 'info', 'azure_locations_token_request_started', {});

  try {
    const { token, subscriptionId } = await ensureAzureManagementAccess();

    logAzureEvent(LOG_SERVICE, 'info', 'azure_locations_token_request_success', {
      subscriptionId
    });

    return {
      accessToken: token.token,
      subscriptionId
    };
  } catch (error) {
    logAzureEvent(LOG_SERVICE, 'error', 'azure_locations_token_request_failed', extractAzureErrorDetails(error));
    throw mapAzureNetworkError(error);
  }
};

const getSubscriptionLocations = async () => {
  if (subscriptionLocationsCache.expiresAt > Date.now()) {
    logAzureEvent(LOG_SERVICE, 'info', 'azure_locations_cache_hit', {
      locationCount: subscriptionLocationsCache.locations.length
    });
    return subscriptionLocationsCache.locations;
  }

  logAzureEvent(LOG_SERVICE, 'info', 'azure_locations_api_request_started', {});

  const { accessToken, subscriptionId } = await getManagementAccessToken();

  try {
    const response = await axios.get(
      `https://management.azure.com/subscriptions/${subscriptionId}/locations`,
      {
        params: { 'api-version': '2022-12-01' },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000
      }
    );

    const locations = (response.data?.value || [])
      .map((entry) => {
        const armRegionName = String(entry?.name || '').trim().toLowerCase();
        const displayLocation = String(
          entry?.regionalDisplayName || entry?.displayName || entry?.name || ''
        ).trim();

        if (!armRegionName) {
          return null;
        }

        return {
          arm_region_name: armRegionName,
          display_location: displayLocation || armRegionName,
          metadata: entry?.metadata || null
        };
      })
      .filter((location) => location && isProvisionableLocation(location))
      .sort((left, right) => left.display_location.localeCompare(right.display_location));

    subscriptionLocationsCache.locations = locations;
    subscriptionLocationsCache.expiresAt = Date.now() + CACHE_TTL_MS;

    logAzureEvent(LOG_SERVICE, 'info', 'azure_locations_api_request_success', {
      subscriptionId,
      locationCount: locations.length
    });

    return locations;
  } catch (error) {
    logAzureEvent(LOG_SERVICE, 'error', 'azure_locations_api_request_failed', {
      subscriptionId,
      ...extractAzureErrorDetails(error)
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw mapAzureNetworkError(error);
  }
};

const loadCatalogRegionsByServiceName = async () => {
  if (catalogRegionsCache.expiresAt > Date.now() && catalogRegionsCache.byServiceName.size > 0) {
    return catalogRegionsCache.byServiceName;
  }

  const result = await db.query(
    `
      SELECT
        service_name,
        arm_region_name,
        display_location,
        location
      FROM service_locations
      WHERE COALESCE(retail_price, 0) >= 0
    `
  );

  const byServiceName = new Map();

  for (const row of result.rows) {
    const serviceKey = normalizeServiceName(row.service_name);
    const armRegionName = String(row.arm_region_name || '').trim().toLowerCase();

    if (!serviceKey || !armRegionName) {
      continue;
    }

    if (!byServiceName.has(serviceKey)) {
      byServiceName.set(serviceKey, new Map());
    }

    byServiceName.get(serviceKey).set(armRegionName, {
      arm_region_name: armRegionName,
      display_location: row.display_location || row.location || armRegionName,
      location: row.location || row.display_location || armRegionName
    });
  }

  catalogRegionsCache.byServiceName = byServiceName;
  catalogRegionsCache.expiresAt = Date.now() + CACHE_TTL_MS;

  return byServiceName;
};

const intersectRegionNameSets = (regionSets) => {
  const nonEmptySets = (Array.isArray(regionSets) ? regionSets : []).filter((set) => set && set.size > 0);

  if (nonEmptySets.length === 0) {
    return null;
  }

  let intersection = new Set(nonEmptySets[0]);

  for (let index = 1; index < nonEmptySets.length; index += 1) {
    intersection = new Set([...intersection].filter((region) => nonEmptySets[index].has(region)));
    if (intersection.size === 0) {
      break;
    }
  }

  return intersection;
};

const resolveInstanceOptionForLocation = (
  serviceId,
  instancesByServiceId,
  selectedInstancesByServiceId
) => {
  const selected =
    selectedInstancesByServiceId?.[serviceId] ?? selectedInstancesByServiceId?.[String(serviceId)];

  if (selected) {
    return String(selected).trim();
  }

  const options = instancesByServiceId.get(Number(serviceId)) || [];

  if (options.length === 0) {
    return '';
  }

  const paidOption = options.find((option) => !/free/i.test(String(option?.option_name || '')));
  return (paidOption || options[0])?.option_name || '';
};

const getCatalogRegionsForService = (serviceName, catalogByServiceName) => {
  const directKey = normalizeServiceName(serviceName);
  const directMatch = catalogByServiceName.get(directKey);
  if (directMatch?.size) {
    return directMatch;
  }

  for (const [catalogServiceName, regions] of catalogByServiceName.entries()) {
    if (directKey.includes(catalogServiceName) || catalogServiceName.includes(directKey)) {
      return regions;
    }
  }

  return new Map();
};

const resolveAvailableRegionsForServices = async (
  services,
  instancesByServiceId,
  selectedInstancesByServiceId
) => {
  const catalogByServiceName = await loadCatalogRegionsByServiceName();
  const retailMaps = await Promise.all(
    services.map(async (service) => {
      const serviceId = Number(service.id);
      const instanceOption = resolveInstanceOptionForLocation(
        serviceId,
        instancesByServiceId,
        selectedInstancesByServiceId
      );
      return getServiceRegionalHourlyPrices(service, instanceOption);
    })
  );

  const retailIntersection = intersectRegionalPriceMaps(retailMaps);
  const catalogRegionSets = services.map((service) => {
    const catalogRegions = getCatalogRegionsForService(service.name, catalogByServiceName);
    return new Set(catalogRegions.keys());
  });
  const catalogIntersection = intersectRegionNameSets(catalogRegionSets);

  let availableRegions = null;

  if (retailIntersection.size > 0 && catalogIntersection) {
    availableRegions = new Set(
      [...retailIntersection.keys()].filter((region) => catalogIntersection.has(region))
    );
    if (availableRegions.size === 0) {
      availableRegions = new Set(retailIntersection.keys());
    }
  } else if (retailIntersection.size > 0) {
    availableRegions = new Set(retailIntersection.keys());
  } else if (catalogIntersection) {
    availableRegions = catalogIntersection;
  }

  return {
    availableRegions,
    retailIntersection,
    catalogByServiceName
  };
};

const buildLocationEntries = (regionNames, subscriptionLocations, catalogByServiceName) => {
  const subscriptionByRegion = new Map(
    subscriptionLocations.map((location) => [location.arm_region_name, location])
  );

  const catalogDisplayByRegion = new Map();
  for (const regions of catalogByServiceName.values()) {
    for (const [regionName, location] of regions.entries()) {
      if (!catalogDisplayByRegion.has(regionName)) {
        catalogDisplayByRegion.set(regionName, location);
      }
    }
  }

  return [...regionNames]
    .map((regionName) => {
      const normalizedRegion = String(regionName || '').trim().toLowerCase();
      const subscriptionLocation = subscriptionByRegion.get(normalizedRegion);
      const catalogLocation = catalogDisplayByRegion.get(normalizedRegion);

      return (
        subscriptionLocation ||
        catalogLocation || {
          arm_region_name: normalizedRegion,
          display_location: normalizedRegion
        }
      );
    })
    .filter((location) => location && isProvisionableLocation(location));
};

const filterLocationsForSelectedInstances = async (
  locations,
  services,
  instancesByServiceId,
  selectedInstancesByServiceId
) => {
  const { filterInstancesForLocation, serviceSupportsInstances } = require('./instanceAvailabilityService');

  const servicesById = new Map(
    services.map((service) => [
      Number(service.id),
      {
        id: Number(service.id),
        name: service.name,
        price_per_user: Number(service.price_per_user || 0)
      }
    ])
  );

  const instancesToValidate = services
    .filter((service) => serviceSupportsInstances(service.name))
    .map((service) => {
      const serviceId = Number(service.id);
      const optionName = resolveInstanceOptionForLocation(
        serviceId,
        instancesByServiceId,
        selectedInstancesByServiceId
      );

      if (!optionName) {
        return null;
      }

      return {
        serviceId,
        service_id: serviceId,
        option_name: optionName
      };
    })
    .filter(Boolean);

  if (instancesToValidate.length === 0) {
    return locations;
  }

  const availabilityChecks = await Promise.all(
    locations.map(async (location) => {
      const filtered = await filterInstancesForLocation(
        location.arm_region_name,
        instancesToValidate,
        servicesById
      );

      return filtered.length === instancesToValidate.length ? location : null;
    })
  );

  return availabilityChecks.filter(Boolean);
};

const getLocationsForSelectedServices = async (
  services = [],
  instancesByServiceId = new Map(),
  selectedInstancesByServiceId = {}
) => {
  if (!Array.isArray(services) || services.length === 0) {
    return [];
  }

  const [subscriptionLocations, availability] = await Promise.all([
    getSubscriptionLocations(),
    resolveAvailableRegionsForServices(services, instancesByServiceId, selectedInstancesByServiceId)
  ]);

  const subscriptionRegionNames = new Set(
    subscriptionLocations.map((location) => location.arm_region_name)
  );

  let candidateRegionNames = availability.availableRegions;

  if (!candidateRegionNames || candidateRegionNames.size === 0) {
    logAzureEvent(LOG_SERVICE, 'warn', 'azure_locations_no_service_specific_regions', {
      serviceCount: services.length,
      serviceNames: services.map((service) => service.name)
    });
    return [];
  }

  candidateRegionNames = new Set(
    [...candidateRegionNames].filter((regionName) => subscriptionRegionNames.has(regionName))
  );

  let candidateLocations = buildLocationEntries(
    candidateRegionNames,
    subscriptionLocations,
    availability.catalogByServiceName
  );

  candidateLocations = await filterLocationsForSelectedInstances(
    candidateLocations,
    services,
    instancesByServiceId,
    selectedInstancesByServiceId
  );

  const [regionalHourlyPrices, portalHourlyFee] = await Promise.all([
    getRegionalHourlyPricesForServices(
      services,
      instancesByServiceId,
      selectedInstancesByServiceId
    ),
    Promise.resolve(getPortalHourlyFees(services))
  ]);

  logAzureEvent(LOG_SERVICE, 'info', 'azure_locations_filtered_for_services', {
    serviceCount: services.length,
    candidateCount: candidateLocations.length,
    retailRegionCount: availability.retailIntersection.size,
    source: 'service-regional-intersection'
  });

  return candidateLocations
    .map((location) => {
      const infraPrice = Number(regionalHourlyPrices.get(location.arm_region_name) || 0);
      const basePrice = infraPrice + portalHourlyFee;

      return {
        ...location,
        base_price: basePrice,
        basePrice,
        currency: 'USD'
      };
    })
    .sort((left, right) => {
      if (left.base_price !== right.base_price) {
        return left.base_price - right.base_price;
      }

      return left.display_location.localeCompare(right.display_location);
    });
};

module.exports = {
  isProvisionableLocation,
  assertProvisionableLocation,
  getSubscriptionLocations,
  getLocationsForSelectedServices,
  resolveAvailableRegionsForServices
};
