const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { parseFlexibleDateTime } = require('../utils/dateTime');
const { computeBillableHours } = require('../utils/billableHours');
const { getAzureServiceName } = require('./servicePricingMap');
const { isVirtualMachineService, normalizeVmSize } = require('../utils/vmSize');
const {
  mapAppServiceSku,
  mapSqlSku,
  mapStorageSku,
  mapServiceBusSku,
  mapKeyVaultSku,
  mapAksNodeVmSize,
  mapApiManagementSku,
  mapLogAnalyticsSku,
  mapContainerRegistrySku,
  mapCosmosMode,
  mapCdnSku,
  mapLoadBalancerSku,
  mapAppGatewaySku,
  mapSearchSku,
  mapBotServiceSku,
  mapLogicAppMode
} = require('../utils/instancePolicyRules');
const {
  fetchRetailPriceItems,
  retailPriceToHourly,
  selectLowestHourlyPrice
} = require('./azurePricingService');

const ROLE_PRICE_MARKUP = 0;

const escapeODataString = (value) => String(value || '').replace(/'/g, "''");

const mapFoundrySku = (instanceOption, paidSku) =>
  /free/i.test(String(instanceOption || '')) ? 'Free' : paidSku;

const FOUNDRY_RETAIL_PROFILES = [
  {
    pattern: /document intelligence/i,
    productContains: 'Document Intelligence',
    mapSku: (instanceOption) => mapFoundrySku(instanceOption, 'S0')
  },
  {
    pattern: /ai vision/i,
    productContains: 'Vision',
    mapSku: (instanceOption) => mapFoundrySku(instanceOption, 'Standard')
  },
  {
    pattern: /ai language/i,
    productContains: 'Language',
    mapSku: (instanceOption) => mapFoundrySku(instanceOption, 'S0')
  },
  {
    pattern: /ai speech/i,
    productContains: 'Speech',
    mapSku: (instanceOption) => mapFoundrySku(instanceOption, 'S1')
  }
];

const buildFoundryToolsFilter = (productContains, skuName) =>
  `serviceName eq 'Foundry Tools' ` +
  `and contains(productName,'${escapeODataString(productContains)}') ` +
  `and skuName eq '${escapeODataString(skuName)}' ` +
  `and priceType eq 'Consumption'`;

const resolveInstanceOption = (serviceId, instancesByServiceId, selectedInstancesByServiceId) => {
  const selected = selectedInstancesByServiceId?.[serviceId] ?? selectedInstancesByServiceId?.[String(serviceId)];
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

const buildRetailFilter = (service, instanceOption) => {
  const serviceName = String(service.name || service.azure_role || service.category || '');
  const azureServiceName = getAzureServiceName(serviceName);

  if (!azureServiceName) {
    return null;
  }

  const foundryProfile = FOUNDRY_RETAIL_PROFILES.find((profile) => profile.pattern.test(serviceName));
  if (foundryProfile) {
    return buildFoundryToolsFilter(foundryProfile.productContains, foundryProfile.mapSku(instanceOption));
  }

  if (isVirtualMachineService(service.name)) {
    const vmSize = normalizeVmSize(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and armSkuName eq '${escapeODataString(vmSize)}' ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/app service/i.test(serviceName)) {
    const skuToken = mapAppServiceSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/functions/i.test(serviceName)) {
    const raw = String(instanceOption || '').trim().toLowerCase();
    const skuToken = /premium/i.test(raw) ? 'Premium' : /dedicated/i.test(raw) ? 'Dedicated' : 'Consumption';
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/sql database/i.test(serviceName)) {
    const skuToken = mapSqlSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/blob storage|data lake storage/i.test(serviceName)) {
    const skuToken = mapStorageSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/service bus/i.test(serviceName)) {
    const skuToken = mapServiceBusSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/key vault/i.test(serviceName)) {
    const skuToken = mapKeyVaultSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/kubernetes/i.test(serviceName)) {
    const vmSize = mapAksNodeVmSize(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and armSkuName eq '${escapeODataString(vmSize)}' ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/cosmos db/i.test(serviceName)) {
    const skuToken = mapCosmosMode(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/logic app/i.test(serviceName)) {
    const skuToken = mapLogicAppMode(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/api management/i.test(serviceName)) {
    const skuToken = mapApiManagementSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/log analytics/i.test(serviceName)) {
    const skuToken = mapLogAnalyticsSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/container registry/i.test(serviceName)) {
    const skuToken = mapContainerRegistrySku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/\bcdn\b/i.test(serviceName)) {
    const skuToken = mapCdnSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/load balancer/i.test(serviceName)) {
    const skuToken = mapLoadBalancerSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/application gateway/i.test(serviceName)) {
    const skuToken = mapAppGatewaySku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/ai search/i.test(serviceName)) {
    const skuToken = mapSearchSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/bot service/i.test(serviceName)) {
    const skuToken = mapBotServiceSku(instanceOption);
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(skuName,'${escapeODataString(skuToken)}') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/event grid/i.test(serviceName)) {
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/application insights/i.test(serviceName)) {
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and contains(productName,'Application Insights') ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/^azure monitor$/i.test(serviceName.trim())) {
    return (
      `serviceName eq '${escapeODataString(azureServiceName)}' ` +
      `and priceType eq 'Consumption'`
    );
  }

  if (/entra id/i.test(serviceName) || /azure devops/i.test(serviceName)) {
    return null;
  }

  return `serviceName eq '${escapeODataString(azureServiceName)}' and priceType eq 'Consumption'`;
};

const aggregateHourlyPricesByRegion = (items) => {
  const byRegion = new Map();

  for (const item of items) {
    const region = String(item?.armRegionName || '').trim().toLowerCase();
    if (!region) {
      continue;
    }

    const hourlyPrice = retailPriceToHourly(Number(item.retailPrice), item.unitOfMeasure);
    if (!Number.isFinite(hourlyPrice) || hourlyPrice < 0) {
      continue;
    }

    const current = byRegion.get(region);
    if (current === undefined || hourlyPrice < current) {
      byRegion.set(region, hourlyPrice);
    }
  }

  return byRegion;
};

const getServiceRegionalHourlyPrices = async (service, instanceOption) => {
  const filter = buildRetailFilter(service, instanceOption);
  if (!filter) {
    return new Map();
  }

  const items = await fetchRetailPriceItems(filter);
  return aggregateHourlyPricesByRegion(items);
};

/** @deprecated Use getServiceRegionalHourlyPrices */
const getServiceRegionalDailyPrices = async (service, instanceOption) => {
  const hourlyByRegion = await getServiceRegionalHourlyPrices(service, instanceOption);
  const dailyByRegion = new Map();

  for (const [region, hourlyPrice] of hourlyByRegion.entries()) {
    dailyByRegion.set(region, hourlyPrice * 24);
  }

  return dailyByRegion;
};

const mergeRegionalPriceMaps = (maps) => {
  const merged = new Map();

  for (const priceMap of maps) {
    for (const [region, price] of priceMap.entries()) {
      merged.set(region, (merged.get(region) || 0) + price);
    }
  }

  return merged;
};

const intersectRegionalPriceMaps = (maps) => {
  const nonEmptyMaps = (Array.isArray(maps) ? maps : []).filter((priceMap) => priceMap.size > 0);

  if (nonEmptyMaps.length === 0) {
    return new Map();
  }

  let intersection = new Set(nonEmptyMaps[0].keys());

  for (let index = 1; index < nonEmptyMaps.length; index += 1) {
    intersection = new Set([...intersection].filter((region) => nonEmptyMaps[index].has(region)));
    if (intersection.size === 0) {
      break;
    }
  }

  const merged = mergeRegionalPriceMaps(nonEmptyMaps);

  return new Map([...intersection].map((region) => [region, merged.get(region) || 0]));
};

const loadPricingContext = async (serviceIds) => {
  const normalizedServiceIds = Array.from(
    new Set(
      (Array.isArray(serviceIds) ? serviceIds : [])
        .map((serviceId) => Number(serviceId))
        .filter((serviceId) => Number.isInteger(serviceId) && serviceId > 0)
    )
  );

  if (normalizedServiceIds.length === 0) {
    return {
      services: [],
      instancesByServiceId: new Map()
    };
  }

  const servicesResult = await db.query(
    `
      SELECT
        id,
        name,
        azure_role,
        category,
        COALESCE(price_per_user, 0) AS price_per_user,
        COALESCE(supports_regions, true) AS supports_regions
      FROM services
      WHERE id = ANY($1::int[])
    `,
    [normalizedServiceIds]
  );

  const instancesResult = await db.query(
    `
      SELECT
        service_id,
        option_name
      FROM service_instance_options
      WHERE service_id = ANY($1::bigint[])
      ORDER BY service_id, sort_order, option_name
    `,
    [normalizedServiceIds]
  );

  const instancesByServiceId = new Map();
  instancesResult.rows.forEach((row) => {
    const serviceId = Number(row.service_id);
    if (!instancesByServiceId.has(serviceId)) {
      instancesByServiceId.set(serviceId, []);
    }
    instancesByServiceId.get(serviceId).push({ option_name: row.option_name });
  });

  return {
    services: servicesResult.rows,
    instancesByServiceId
  };
};

const getPortalHourlyFees = (services) =>
  services.reduce((sum, service) => sum + Math.max(0, Number(service.price_per_user || 0)), 0);

/** @deprecated Use getPortalHourlyFees — price_per_user is stored as USD/hr */
const getPortalDailyFees = (services) => getPortalHourlyFees(services) * 24;

const getRegionalHourlyPricesForServices = async (
  services,
  instancesByServiceId,
  selectedInstancesByServiceId = {}
) => {
  const priceMaps = await Promise.all(
    services.map(async (service) => {
      const serviceId = Number(service.id);
      const instanceOption = resolveInstanceOption(
        serviceId,
        instancesByServiceId,
        selectedInstancesByServiceId
      );
      return getServiceRegionalHourlyPrices(service, instanceOption);
    })
  );

  return mergeRegionalPriceMaps(priceMaps);
};

/** @deprecated Use getRegionalHourlyPricesForServices */
const getRegionalDailyPricesForServices = async (
  services,
  instancesByServiceId,
  selectedInstancesByServiceId = {}
) => {
  const hourlyMap = await getRegionalHourlyPricesForServices(
    services,
    instancesByServiceId,
    selectedInstancesByServiceId
  );
  const dailyMap = new Map();

  for (const [region, hourlyPrice] of hourlyMap.entries()) {
    dailyMap.set(region, hourlyPrice * 24);
  }

  return dailyMap;
};

const getHourlyPriceForLocation = async (
  services,
  instancesByServiceId,
  selectedInstancesByServiceId,
  location
) => {
  const normalizedLocation = String(location || '').trim().toLowerCase();
  let infraHourlyTotal = 0;
  let portalHourlyTotal = getPortalHourlyFees(services);

  for (const service of services) {
    const serviceId = Number(service.id);
    const instanceOption = resolveInstanceOption(
      serviceId,
      instancesByServiceId,
      selectedInstancesByServiceId
    );
    const filter = buildRetailFilter(service, instanceOption);

    if (!filter) {
      continue;
    }

    const items = await fetchRetailPriceItems(
      `${filter} and armRegionName eq '${escapeODataString(normalizedLocation)}'`
    );
    infraHourlyTotal += selectLowestHourlyPrice(items);
  }

  return {
    infraHourlyTotal,
    portalHourlyTotal,
    hourlyTotal: infraHourlyTotal + portalHourlyTotal
  };
};

const normalizeSelectedInstances = (selectedInstances) => {
  if (!Array.isArray(selectedInstances)) {
    return {};
  }

  return selectedInstances.reduce((accumulator, entry) => {
    const serviceId = Number(entry?.serviceId ?? entry?.service_id);
    const instanceOption = String(entry?.instanceOption ?? entry?.instance_option ?? '').trim();

    if (Number.isInteger(serviceId) && serviceId > 0 && instanceOption) {
      accumulator[serviceId] = instanceOption;
    }

    return accumulator;
  }, {});
};

const calculateEstimate = async ({
  accountCount,
  serviceIds,
  location,
  startDate,
  endDate,
  selectedInstances = [],
  selectedRoles = [],
  costingMode = 'shared',
  usageWindows = []
}) => {
  const resolvedAccountCount = Number(accountCount);
  if (!Number.isInteger(resolvedAccountCount) || resolvedAccountCount <= 0) {
    throw new AppError('accountCount must be a positive integer.', 400);
  }

  const { services, instancesByServiceId } = await loadPricingContext(serviceIds);
  if (services.length === 0) {
    throw new AppError('No valid services found for pricing.', 400);
  }

  const selectedInstancesByServiceId = normalizeSelectedInstances(selectedInstances);
  const start = parseFlexibleDateTime(startDate);
  const end = parseFlexibleDateTime(endDate);

  if (!start || !end || end < start) {
    throw new AppError('endDate must be on or after startDate', 400);
  }

  const durationMs = end.getTime() - start.getTime();
  const { calendarHours, billableHours, usesUsageWindows } = computeBillableHours(
    start,
    end,
    usageWindows
  );
  const durationHours = billableHours;
  const durationDays = Number((durationHours / 24).toFixed(2));
  const roleCount = Array.isArray(selectedRoles) ? selectedRoles.length : 0;
  const roleMarkupHourly = roleCount * ROLE_PRICE_MARKUP;

  const { infraHourlyTotal, portalHourlyTotal, hourlyTotal } = await getHourlyPriceForLocation(
    services,
    instancesByServiceId,
    selectedInstancesByServiceId,
    location
  );

  const baseHourlyPrice = hourlyTotal + roleMarkupHourly;
  const sharedInfra = String(costingMode || 'shared').toLowerCase() !== 'per_user';
  const infraMultiplier = sharedInfra ? 1 : resolvedAccountCount;
  const totalPrice =
    durationHours *
    (infraHourlyTotal * infraMultiplier + portalHourlyTotal * resolvedAccountCount + roleMarkupHourly);

  const lineItems = await Promise.all(
    services.map(async (service) => {
      const serviceId = Number(service.id);
      const instanceOption = resolveInstanceOption(
        serviceId,
        instancesByServiceId,
        selectedInstancesByServiceId
      );
      const filter = buildRetailFilter(service, instanceOption);
      const items = filter
        ? await fetchRetailPriceItems(
            `${filter} and armRegionName eq '${escapeODataString(String(location || '').trim().toLowerCase())}'`
          )
        : [];
      const infraHourly = selectLowestHourlyPrice(items);
      const portalHourly = Math.max(0, Number(service.price_per_user || 0));

      return {
        serviceId,
        name: service.name,
        instanceOption: instanceOption || null,
        infraHourlyPrice: Number(infraHourly.toFixed(6)),
        portalHourlyPrice: Number(portalHourly.toFixed(6)),
        hourlyPrice: Number((infraHourly + portalHourly).toFixed(6)),
        infraDailyPrice: Number((infraHourly * 24).toFixed(4)),
        portalDailyPrice: Number((portalHourly * 24).toFixed(4)),
        dailyPrice: Number(((infraHourly + portalHourly) * 24).toFixed(4))
      };
    })
  );

  return {
    success: true,
    baseHourlyPrice: Number(baseHourlyPrice.toFixed(4)),
    basePrice: Number(baseHourlyPrice.toFixed(4)),
    durationHours: Number(durationHours.toFixed(2)),
    calendarHours: Number(calendarHours.toFixed(2)),
    billableHours: Number(billableHours.toFixed(2)),
    usesUsageWindows,
    duration: durationDays,
    accounts: resolvedAccountCount,
    totalPrice: Number(totalPrice.toFixed(2)),
    currency: 'USD',
    roleCount,
    costingMode: sharedInfra ? 'shared' : 'per_user',
    portalHourlyTotal: Number(portalHourlyTotal.toFixed(6)),
    infraHourlyTotal: Number(infraHourlyTotal.toFixed(6)),
    services: lineItems
  };
};

const getHourlyRateForProvisionedResources = async (provisionedRows, location) => {
  const activeRows = (provisionedRows || []).filter((row) =>
    ['policy_configured', 'provisioned'].includes(String(row.status || ''))
  );

  if (activeRows.length === 0) {
    return {
      hourlyRate: 0,
      resourceCount: 0,
      resources: []
    };
  }

  const serviceIds = activeRows.map((row) => Number(row.service_id));
  const { services } = await loadPricingContext(serviceIds);
  const normalizedLocation = String(location || '').trim().toLowerCase();
  const selectedInstancesByServiceId = activeRows.reduce((accumulator, row) => {
    accumulator[Number(row.service_id)] = String(row.instance_option || '').trim();
    return accumulator;
  }, {});

  let hourlyTotal = 0;
  const resources = [];

  for (const row of activeRows) {
    const serviceId = Number(row.service_id);
    const service = services.find((entry) => Number(entry.id) === serviceId);

    if (!service) {
      continue;
    }

    const instanceOption = selectedInstancesByServiceId[serviceId] || '';
    const filter = buildRetailFilter(service, instanceOption);
    let infraHourly = 0;

    if (filter && normalizedLocation) {
      const items = await fetchRetailPriceItems(
        `${filter} and armRegionName eq '${escapeODataString(normalizedLocation)}'`
      );
      infraHourly = selectLowestHourlyPrice(items);
    }

    const portalHourly = Math.max(0, Number(service.price_per_user || 0));
    const hourlyRate = infraHourly + portalHourly;

    hourlyTotal += hourlyRate;
    resources.push({
      serviceId,
      name: service.name,
      instanceOption: instanceOption || null,
      resourceType: row.resource_type,
      resourceName: row.resource_name,
      hourlyRate: Number(hourlyRate.toFixed(6))
    });
  }

  return {
    hourlyRate: Number(hourlyTotal.toFixed(6)),
    resourceCount: resources.length,
    resources
  };
};

module.exports = {
  loadPricingContext,
  getServiceRegionalHourlyPrices,
  getServiceRegionalDailyPrices,
  getRegionalHourlyPricesForServices,
  getRegionalDailyPricesForServices,
  intersectRegionalPriceMaps,
  getPortalHourlyFees,
  getPortalDailyFees,
  calculateEstimate,
  getHourlyRateForProvisionedResources
};
