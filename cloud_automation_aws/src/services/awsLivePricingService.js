import { GetProductsCommand } from '@aws-sdk/client-pricing';
import { pricingClient } from '../config/aws.js';
import Service from '../models/Service.js';
import { INSTANCE_FILTERS } from './catalogSyncService.js';

const FLAT_RATE_INSTANCE_TYPES = {
  Lambda: 'per-GB-second',
  S3: 'per-GB',
  CloudFront: 'per-GB-transferred',
  SQS: 'per-million-requests',
  SNS: 'per-million-notifications',
  Kinesis: 'per-shard-hour',
  DynamoDB: 'per-RCU-WCU',
  VPC: 'per-NAT-gateway-hour',
};

const LIGHTSAIL_BUNDLE_MAP = {
  nano: 'nano_3_0',
  micro: 'micro_3_0',
  small: 'small_3_0',
  medium: 'medium_3_0',
  large: 'large_3_0',
  xlarge: 'xlarge_3_0',
};

const LIGHTSAIL_FALLBACK = {
  nano_3_0: { pricePerHour: 0.00521, pricePerDay: 0.125 },
  micro_3_0: { pricePerHour: 0.01042, pricePerDay: 0.25 },
  small_3_0: { pricePerHour: 0.02083, pricePerDay: 0.50 },
  medium_3_0: { pricePerHour: 0.04167, pricePerDay: 1.0 },
  large_3_0: { pricePerHour: 0.08333, pricePerDay: 2.0 },
  xlarge_3_0: { pricePerHour: 0.16667, pricePerDay: 4.0 },
};

const SAGEMAKER_FALLBACK = {
  'ml.t3.medium': { pricePerHour: 0.0464, pricePerDay: 1.1136 },
  'ml.t3.large': { pricePerHour: 0.0928, pricePerDay: 2.2272 },
  'ml.m5.large': { pricePerHour: 0.115, pricePerDay: 2.76 },
  'ml.m5.xlarge': { pricePerHour: 0.23, pricePerDay: 5.52 },
  'ml.p3.2xlarge': { pricePerHour: 3.825, pricePerDay: 91.8 },
};

const pricingCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(serviceName, instanceType, regionCode) {
  return `${serviceName}:${instanceType || 'flat'}:${regionCode}`;
}

function readCache(key) {
  const entry = pricingCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    pricingCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  pricingCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function extractPrice(priceList) {
  if (!priceList?.length) return null;

  const product = JSON.parse(priceList[0]);
  const onDemandTerms = product.terms?.OnDemand;
  if (!onDemandTerms) return null;

  const termKey = Object.keys(onDemandTerms)[0];
  if (!termKey) return null;

  const priceDimensions = onDemandTerms[termKey]?.priceDimensions;
  if (!priceDimensions) return null;

  const dimKey = Object.keys(priceDimensions)[0];
  if (!dimKey) return null;

  const dimension = priceDimensions[dimKey];
  const unitPrice = parseFloat(dimension.pricePerUnit?.USD ?? '0');
  if (Number.isNaN(unitPrice)) return null;

  return {
    unitPrice,
    priceUnit: dimension.unit || dimension.description || 'unit',
    locationName: product.product?.attributes?.location || null,
  };
}

export function buildLivePricingFilters(serviceName, instanceType, regionCode) {
  const regionFilter = { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode };

  switch (serviceName) {
    case 'EC2':
      return [
        regionFilter,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
        { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
        { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
        { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' },
      ];
    case 'RDS':
      return [
        regionFilter,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'databaseEngine', Value: 'MySQL' },
        { Type: 'TERM_MATCH', Field: 'deploymentOption', Value: 'Single-AZ' },
      ];
    case 'ElastiCache':
      return [
        regionFilter,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'cacheEngine', Value: 'Redis' },
      ];
    case 'EKS':
      return [
        regionFilter,
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
        { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
        { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
        { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' },
      ];
    case 'SageMaker':
      return [
        regionFilter,
        { Type: 'TERM_MATCH', Field: 'instanceName', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'component', Value: 'Hosting' },
      ];
    case 'Lightsail': {
      const bundleType = LIGHTSAIL_BUNDLE_MAP[instanceType] || instanceType;
      return [regionFilter, { Type: 'TERM_MATCH', Field: 'bundleType', Value: bundleType }];
    }
    case 'Redshift':
    case 'OpenSearch':
    case 'EMR':
      return [regionFilter, { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType }];
    default:
      return [regionFilter, { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType }];
  }
}

function resolveServiceCode(service) {
  if (service.name === 'EKS') return 'AmazonEC2';
  return service.awsServiceCode;
}

async function fetchLivePricing(serviceCode, filters) {
  const command = new GetProductsCommand({
    ServiceCode: serviceCode,
    Filters: filters,
    MaxResults: 1,
  });

  const data = await pricingClient.send(command);
  return extractPrice(data.PriceList);
}

function formatInstancePricing(service, instanceType, price, locationName) {
  const pricePerHour = price.unitPrice;
  const pricePerDay = parseFloat((pricePerHour * 24).toFixed(6));

  return {
    instanceType,
    pricePerHour,
    pricePerDay,
    priceUnit: price.priceUnit,
    unitPrice: price.unitPrice,
    flatRate: false,
    locationName,
    serviceName: service.name,
  };
}

function formatFlatRatePricing(service, price, locationName) {
  return {
    instanceType: FLAT_RATE_INSTANCE_TYPES[service.name] || 'flat-rate',
    pricePerHour: 0,
    pricePerDay: 0,
    priceUnit: price.priceUnit,
    unitPrice: price.unitPrice,
    flatRate: true,
    locationName,
    serviceName: service.name,
  };
}

function applyFallbackPricing(service, instanceType, regionCode) {
  if (service.name === 'Lightsail') {
    const bundleType = LIGHTSAIL_BUNDLE_MAP[instanceType] || instanceType;
    const fallback = LIGHTSAIL_FALLBACK[bundleType];
    if (!fallback) return null;

    return {
      instanceType,
      pricePerHour: fallback.pricePerHour,
      pricePerDay: fallback.pricePerDay,
      priceUnit: 'Hrs',
      unitPrice: fallback.pricePerHour,
      flatRate: false,
      locationName: null,
      serviceName: service.name,
    };
  }

  if (service.name === 'SageMaker' && SAGEMAKER_FALLBACK[instanceType]) {
    const fallback = SAGEMAKER_FALLBACK[instanceType];
    return {
      instanceType,
      pricePerHour: fallback.pricePerHour,
      pricePerDay: fallback.pricePerDay,
      priceUnit: 'Hrs',
      unitPrice: fallback.pricePerHour,
      flatRate: false,
      locationName: null,
      serviceName: service.name,
    };
  }

  return null;
}

export async function getLivePricingForService(service, instanceType, regionCode) {
  const key = cacheKey(service.name, instanceType, regionCode);
  const cached = readCache(key);
  if (cached) return cached;

  let result = null;

  if (service.pricingType === 'flat_rate') {
    const price = await fetchLivePricing(service.awsServiceCode, [
      { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
    ]);

    if (price) {
      result = formatFlatRatePricing(service, price, price.locationName);
    }
  } else if (instanceType) {
    const filters = buildLivePricingFilters(service.name, instanceType, regionCode);
    const price = await fetchLivePricing(resolveServiceCode(service), filters);

    if (price) {
      result = formatInstancePricing(service, instanceType, price, price.locationName);
    } else {
      result = applyFallbackPricing(service, instanceType, regionCode);
    }
  }

  if (result) {
    writeCache(key, result);
  }

  return result;
}

export async function getLivePricingOptions(serviceId, regionCode) {
  const service = await Service.findById(serviceId).lean();
  if (!service) return [];

  if (service.pricingType === 'flat_rate') {
    const pricing = await getLivePricingForService(service, null, regionCode);
    return pricing ? [pricing] : [];
  }

  const instanceTypes = INSTANCE_FILTERS[service.name];
  if (!instanceTypes?.length) return [];

  const options = [];

  for (const instanceType of instanceTypes) {
    const pricing = await getLivePricingForService(service, instanceType, regionCode);
    if (pricing) {
      options.push(pricing);
    }
  }

  return options.sort((left, right) => left.pricePerHour - right.pricePerHour);
}

export function parseInstanceSelections(value) {
  if (!value) return {};

  const raw = Array.isArray(value) ? value.join(',') : String(value);

  return raw.split(',').reduce((accumulator, pair) => {
    const [rawServiceId, ...optionParts] = pair.split(':');
    const serviceId = String(rawServiceId || '').trim();
    const instanceType = optionParts.join(':').trim();

    if (serviceId && instanceType) {
      accumulator[serviceId] = instanceType;
    }

    return accumulator;
  }, {});
}

export function resolveInstanceTypeForService(service, selectedInstancesByServiceId) {
  const serviceId = String(service._id);
  const selected = selectedInstancesByServiceId[serviceId];

  if (selected) {
    return selected;
  }

  const options = INSTANCE_FILTERS[service.name] || [];
  if (options.length === 0) {
    return null;
  }

  return (
    options.find((option) =>
      /medium|db\.t3\.medium|cache\.t3\.medium|t3\.medium|m5\.large/i.test(option)
    ) ||
    options[Math.min(2, options.length - 1)] ||
    options[0]
  );
}
