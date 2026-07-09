const axios = require('axios');
const db = require('../db/postgres');
const { ensureAzureManagementAccess } = require('../config/azure');
const { getLocationConstraintsForService } = require('../config/serviceResourceProviderMap');
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
const DEFAULT_FALLBACK_REGIONS = (
  process.env.AZURE_DEFAULT_REGIONS || 'eastus,westus,centralindia,southeastasia'
)
  .split(',')
  .map((region) => region.trim().toLowerCase())
  .filter(Boolean);
const subscriptionLocationsCache = {
  expiresAt: 0,
  locations: []
};
const catalogRegionsCache = {
  expiresAt: 0,
  byServiceName: new Map()
};
const azureResourceLocationCache = new Map();
const providerMetadataCache = new Map();
const providerMetadataInflight = new Map();

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

const isRegionAgnosticService = (service) => {
  if (service?.supports_regions === false) {
    return true;
  }

  const name = normalizeServiceName(service?.name);
  return /entra id|azure devops/.test(name);
};

const normalizeProviderLocationLabel = (locationLabel) =>
  String(locationLabel || '')
    .trim()
    .toLowerCase()
    .replace(/^\([^)]+\)\s*/, '')
    .replace(/\s+/g, '');

const getCachedAzureResourceLocations = (cacheKey) => {
  const cached = azureResourceLocationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.regions;
  }

  return null;
};

const setCachedAzureResourceLocations = (cacheKey, regions) => {
  azureResourceLocationCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    regions
  });
};

const getProviderMetadata = async (providerNamespace) => {
  const normalizedProvider = String(providerNamespace || '').trim();
  const cacheKey = normalizedProvider.toLowerCase();

  const cached = providerMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.resourceTypes;
  }

  if (providerMetadataInflight.has(cacheKey)) {
    return providerMetadataInflight.get(cacheKey);
  }

  const fetchPromise = (async () => {
    const { accessToken, subscriptionId } = await getManagementAccessToken();

    try {
      const response = await axios.get(
        `https://management.azure.com/subscriptions/${subscriptionId}/providers/${normalizedProvider}`,
        {
          params: { 'api-version': '2021-04-01' },
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 20000
        }
      );

      const resourceTypes = new Map();
      for (const entry of response.data?.resourceTypes || []) {
        const resourceType = String(entry?.resourceType || '').trim();
        if (!resourceType) {
          continue;
        }

        resourceTypes.set(resourceType, Array.isArray(entry?.locations) ? entry.locations : []);
      }

      providerMetadataCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        resourceTypes
      });

      logAzureEvent(LOG_SERVICE, 'info', 'azure_provider_metadata_fetched', {
        provider: normalizedProvider,
        resourceTypeCount: resourceTypes.size
      });

      return resourceTypes;
    } catch (error) {
      logAzureEvent(LOG_SERVICE, 'warn', 'azure_provider_metadata_fetch_failed', {
        provider: normalizedProvider,
        ...extractAzureErrorDetails(error)
      });

      return null;
    }
  })();

  providerMetadataInflight.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    providerMetadataInflight.delete(cacheKey);
  }
};

const fetchAzureResourceLocationSet = async ({ provider, resourceType, subscriptionRegionNames }) => {
  const normalizedProvider = String(provider || '').trim();
  const normalizedResourceType = String(resourceType || '').trim();
  const cacheKey = `${normalizedProvider.toLowerCase()}/${normalizedResourceType.toLowerCase()}`;

  const cached = getCachedAzureResourceLocations(cacheKey);
  if (cached) {
    return cached;
  }

  const providerMetadata = await getProviderMetadata(normalizedProvider);
  if (!providerMetadata) {
    return null;
  }

  const locationLabels = providerMetadata.get(normalizedResourceType) || [];
  if (!Array.isArray(locationLabels) || locationLabels.length === 0) {
    return null;
  }

  const regions = new Set();

  for (const locationLabel of locationLabels) {
    const armRegionName = normalizeProviderLocationLabel(locationLabel);
    if (!armRegionName) {
      continue;
    }

    if (subscriptionRegionNames && !subscriptionRegionNames.has(armRegionName)) {
      continue;
    }

    if (!isProvisionableLocation({ arm_region_name: armRegionName })) {
      continue;
    }

    regions.add(armRegionName);
  }

  setCachedAzureResourceLocations(cacheKey, regions);

  logAzureEvent(LOG_SERVICE, 'info', 'azure_resource_locations_fetched', {
    provider: normalizedProvider,
    resourceType: normalizedResourceType,
    regionCount: regions.size
  });

  return regions;
};

const getDeployableRegionsForService = async (service, subscriptionRegionNames) => {
  const constraints = getLocationConstraintsForService(service?.name);
  const locationSets = [];

  for (const { provider, resourceType } of constraints.resourceTypes) {
    const regions = await fetchAzureResourceLocationSet({
      provider,
      resourceType,
      subscriptionRegionNames
    });
    if (regions?.size) {
      locationSets.push(regions);
    }
  }

  return intersectRegionNameSets(locationSets);
};

const getDeployableRegionsForServices = async (services, subscriptionRegionNames = null) => {
  const regionConstrainedServices = (Array.isArray(services) ? services : []).filter(
    (service) => !isRegionAgnosticService(service)
  );

  if (regionConstrainedServices.length === 0) {
    return null;
  }

  const perServiceRegionSets = await Promise.all(
    regionConstrainedServices.map((service) =>
      getDeployableRegionsForService(service, subscriptionRegionNames)
    )
  );

  const validSets = perServiceRegionSets.filter((regionSet) => regionSet && regionSet.size > 0);
  if (validSets.length === 0) {
    return null;
  }

  return intersectRegionNameSets(validSets);
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

const getCatalogIntersectionForServiceIds = async (serviceIds) => {
  const normalizedServiceIds = (Array.isArray(serviceIds) ? serviceIds : [])
    .map((serviceId) => Number(serviceId))
    .filter((serviceId) => Number.isInteger(serviceId) && serviceId > 0);

  if (normalizedServiceIds.length === 0) {
    return [];
  }

  const result = await db.query(
    `
      SELECT
        sl.arm_region_name,
        MIN(sl.display_location) AS display_location,
        MIN(sl.location) AS location
      FROM service_locations sl
      INNER JOIN services s
        ON LOWER(TRIM(sl.service_name)) = LOWER(TRIM(s.name))
      WHERE s.id = ANY($1::int[])
        AND COALESCE(s.supports_regions, true) = true
      GROUP BY sl.arm_region_name
      HAVING COUNT(DISTINCT s.id) = (
        SELECT COUNT(*)::int
        FROM services
        WHERE id = ANY($1::int[])
          AND COALESCE(supports_regions, true) = true
      )
      ORDER BY sl.arm_region_name
    `,
    [normalizedServiceIds]
  );

  return result.rows.map((row) => ({
    arm_region_name: String(row.arm_region_name || '').trim().toLowerCase(),
    display_location: row.display_location || row.location || row.arm_region_name,
    location: row.location || row.display_location || row.arm_region_name
  }));
};

const resolveAvailableRegionsForServices = async (
  services,
  instancesByServiceId,
  selectedInstancesByServiceId,
  subscriptionRegionNames = null
) => {
  const catalogByServiceName = await loadCatalogRegionsByServiceName();
  const regionConstrainedServices = services.filter((service) => !isRegionAgnosticService(service));

  const [deployableRegions, retailIntersection] = await Promise.all([
    getDeployableRegionsForServices(regionConstrainedServices, subscriptionRegionNames),
    intersectRegionalPriceMaps(
      await Promise.all(
        regionConstrainedServices.map(async (service) => {
          const serviceId = Number(service.id);
          const instanceOption = resolveInstanceOptionForLocation(
            serviceId,
            instancesByServiceId,
            selectedInstancesByServiceId
          );
          return getServiceRegionalHourlyPrices(service, instanceOption);
        })
      )
    )
  ]);

  let availableRegions = deployableRegions;
  let regionSource = 'azure-resource-provider-api';

  if (!availableRegions || availableRegions.size === 0) {
    const catalogRows = await getCatalogIntersectionForServiceIds(
      regionConstrainedServices.map((service) => Number(service.id))
    );

    if (catalogRows.length > 0) {
      availableRegions = new Set(catalogRows.map((row) => row.arm_region_name));
      regionSource = 'catalog-intersection';
    }
  }

  if (!availableRegions || availableRegions.size === 0) {
    availableRegions = new Set(DEFAULT_FALLBACK_REGIONS);
    regionSource = 'default-fallback';
  }

  logAzureEvent(LOG_SERVICE, 'info', 'azure_locations_region_source_resolved', {
    regionSource,
    deployableRegionCount: deployableRegions?.size || 0,
    retailRegionCount: retailIntersection.size,
    availableRegionCount: availableRegions.size,
    regionConstrainedServiceCount: regionConstrainedServices.length
  });

  return {
    availableRegions,
    retailIntersection,
    catalogByServiceName,
    regionConstrainedServiceCount: regionConstrainedServices.length,
    regionSource
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

const getCatalogHourlyPricesForServices = async (serviceIds) => {
  const normalizedServiceIds = (Array.isArray(serviceIds) ? serviceIds : [])
    .map((serviceId) => Number(serviceId))
    .filter((serviceId) => Number.isInteger(serviceId) && serviceId > 0);

  if (normalizedServiceIds.length === 0) {
    return new Map();
  }

  const result = await db.query(
    `
      SELECT
        sl.arm_region_name,
        SUM(COALESCE(sl.retail_price, s.price_per_user, 0))::float8 AS hourly_price
      FROM service_locations sl
      INNER JOIN services s
        ON LOWER(TRIM(sl.service_name)) = LOWER(TRIM(s.name))
      WHERE s.id = ANY($1::int[])
      GROUP BY sl.arm_region_name
    `,
    [normalizedServiceIds]
  );

  const pricesByRegion = new Map();
  for (const row of result.rows) {
    const regionName = String(row.arm_region_name || '').trim().toLowerCase();
    if (!regionName) {
      continue;
    }
    pricesByRegion.set(regionName, Number(row.hourly_price || 0));
  }

  return pricesByRegion;
};

const getLocationsForSelectedServices = async (
  services = [],
  instancesByServiceId = new Map(),
  selectedInstancesByServiceId = {}
) => {
  if (!Array.isArray(services) || services.length === 0) {
    return [];
  }

  const subscriptionLocations = await getSubscriptionLocations();
  const subscriptionRegionNames = new Set(
    subscriptionLocations.map((location) => location.arm_region_name)
  );

  const availability = await resolveAvailableRegionsForServices(
    services,
    instancesByServiceId,
    selectedInstancesByServiceId,
    subscriptionRegionNames
  );

  let candidateRegionNames = availability.availableRegions;

  if (!candidateRegionNames || candidateRegionNames.size === 0) {
    logAzureEvent(LOG_SERVICE, 'warn', 'azure_locations_no_service_specific_regions', {
      serviceCount: services.length,
      serviceNames: services.map((service) => service.name),
      regionConstrainedServiceCount: availability.regionConstrainedServiceCount
    });
    candidateRegionNames = new Set(DEFAULT_FALLBACK_REGIONS);
  }

  candidateRegionNames = new Set(
    [...candidateRegionNames].filter((regionName) => subscriptionRegionNames.has(regionName))
  );

  if (candidateRegionNames.size === 0) {
    logAzureEvent(LOG_SERVICE, 'warn', 'azure_locations_subscription_filter_empty', {
      serviceCount: services.length,
      fallbackRegionCount: DEFAULT_FALLBACK_REGIONS.length
    });
    candidateRegionNames = new Set(
      DEFAULT_FALLBACK_REGIONS.filter((regionName) => subscriptionRegionNames.has(regionName))
    );
  }

  if (candidateRegionNames.size === 0) {
    return [];
  }

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

  const [regionalHourlyPrices, portalHourlyFee, catalogHourlyPrices] = await Promise.all([
    getRegionalHourlyPricesForServices(
      services,
      instancesByServiceId,
      selectedInstancesByServiceId
    ),
    Promise.resolve(getPortalHourlyFees(services)),
    getCatalogHourlyPricesForServices(services.map((service) => Number(service.id)))
  ]);

  logAzureEvent(LOG_SERVICE, 'info', 'azure_locations_filtered_for_services', {
    serviceCount: services.length,
    candidateCount: candidateLocations.length,
    retailRegionCount: availability.retailIntersection.size,
    source: availability.regionSource || 'azure-resource-provider-api'
  });

  return candidateLocations
    .map((location) => {
      const retailInfraPrice = Number(regionalHourlyPrices.get(location.arm_region_name) || 0);
      const catalogInfraPrice = Number(catalogHourlyPrices.get(location.arm_region_name) || 0);
      const basePrice =
        retailInfraPrice > 0
          ? retailInfraPrice + portalHourlyFee
          : catalogInfraPrice > 0
            ? catalogInfraPrice
            : portalHourlyFee;

      return {
        ...location,
        base_price: basePrice,
        basePrice,
        currency: 'USD',
        serviceCount: services.length
      };
    })
    .sort((left, right) => {
      if (left.base_price !== right.base_price) {
        return left.base_price - right.base_price;
      }

      return left.display_location.localeCompare(right.display_location);
    });
};

const assertLocationAvailableForServices = async (location, services = []) => {
  assertProvisionableLocation(location);

  const normalizedLocation = String(location || '').trim().toLowerCase();
  const subscriptionLocations = await getSubscriptionLocations();
  const subscriptionRegionNames = new Set(
    subscriptionLocations.map((entry) => entry.arm_region_name)
  );
  const deployableRegions = await getDeployableRegionsForServices(services, subscriptionRegionNames);

  if (!deployableRegions || deployableRegions.size === 0) {
    return;
  }

  if (!deployableRegions.has(normalizedLocation)) {
    throw new AppError(
      `Region '${normalizedLocation}' is not available for the selected services. Choose a region from the available list.`,
      400
    );
  }
};

module.exports = {
  isProvisionableLocation,
  assertProvisionableLocation,
  assertLocationAvailableForServices,
  getSubscriptionLocations,
  getLocationsForSelectedServices,
  resolveAvailableRegionsForServices,
  getDeployableRegionsForServices
};
