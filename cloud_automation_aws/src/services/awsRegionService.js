import { DescribeRegionsCommand } from '@aws-sdk/client-ec2';
import { ec2Client } from '../config/aws.js';
import Service from '../models/Service.js';
import {
  getLivePricingForService,
  parseInstanceSelections,
  resolveInstanceTypeForService,
} from './awsLivePricingService.js';

const REGIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const REGION_BATCH_SIZE = 6;

const regionsCache = {
  expiresAt: 0,
  regions: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseLocationGroup(locationName) {
  if (!locationName) return '';
  const parenIndex = locationName.indexOf('(');
  if (parenIndex <= 0) return locationName.trim();
  return locationName.slice(0, parenIndex).trim();
}

export async function getEnabledRegions() {
  if (regionsCache.expiresAt > Date.now() && regionsCache.regions.length > 0) {
    return regionsCache.regions;
  }

  const response = await ec2Client.send(new DescribeRegionsCommand({ AllRegions: false }));
  const regions = (response.Regions || [])
    .map((entry) => ({
      code: String(entry.RegionName || '').trim(),
      optInStatus: entry.OptInStatus || null,
    }))
    .filter((entry) => entry.code)
    .sort((left, right) => left.code.localeCompare(right.code));

  regionsCache.regions = regions;
  regionsCache.expiresAt = Date.now() + REGIONS_CACHE_TTL_MS;

  return regions;
}

export async function isEnabledRegion(regionCode) {
  const regions = await getEnabledRegions();
  return regions.some((entry) => entry.code === regionCode);
}

async function evaluateRegionForServices(regionCode, services, selectedInstancesByServiceId) {
  let totalHourlyPrice = 0;
  let displayName = null;

  for (const service of services) {
    const instanceType = resolveInstanceTypeForService(service, selectedInstancesByServiceId);

    if (service.pricingType === 'instance' && !instanceType) {
      return null;
    }

    const pricing = await getLivePricingForService(service, instanceType, regionCode);
    if (!pricing) {
      return null;
    }

    if (!displayName && pricing.locationName) {
      displayName = pricing.locationName;
    }

    totalHourlyPrice += Number(pricing.pricePerHour) || 0;
  }

  return {
    code: regionCode,
    name: displayName || regionCode,
    location: parseLocationGroup(displayName) || regionCode,
    basePrice: parseFloat(totalHourlyPrice.toFixed(6)),
    currency: 'USD',
  };
}

export async function getAvailableRegions(serviceIds, instanceSelections = {}) {
  const normalizedServiceIds = Array.from(
    new Set(
      (Array.isArray(serviceIds) ? serviceIds : String(serviceIds || '').split(','))
        .map((serviceId) => String(serviceId || '').trim())
        .filter(Boolean)
    )
  );

  if (normalizedServiceIds.length === 0) {
    return [];
  }

  const services = await Service.find({ _id: { $in: normalizedServiceIds } }).lean();
  if (services.length === 0) {
    return [];
  }

  const selectedInstancesByServiceId = parseInstanceSelections(instanceSelections);
  const enabledRegions = await getEnabledRegions();
  const availableRegions = [];

  for (let index = 0; index < enabledRegions.length; index += REGION_BATCH_SIZE) {
    const batch = enabledRegions.slice(index, index + REGION_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((region) =>
        evaluateRegionForServices(region.code, services, selectedInstancesByServiceId)
      )
    );

    for (const result of batchResults) {
      if (result) {
        availableRegions.push(result);
      }
    }

    if (index + REGION_BATCH_SIZE < enabledRegions.length) {
      await sleep(75);
    }
  }

  return availableRegions.sort((left, right) => {
    if (left.basePrice !== right.basePrice) {
      return left.basePrice - right.basePrice;
    }
    return left.name.localeCompare(right.name);
  });
}

export async function listRegionsWithNames() {
  const enabledRegions = await getEnabledRegions();
  return enabledRegions.map((region) => ({
    code: region.code,
    name: region.code,
  }));
}
