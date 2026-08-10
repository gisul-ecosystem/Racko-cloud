import ServicePricing from '../models/ServicePricing.js';
import Service from '../models/Service.js';
import { GCP_SYNC_REGIONS, GCP_REGION_NAMES } from '../config/gcp.js';
import {
  getLivePricingForService,
  getLivePricingOptions,
  resolveInstanceTypeForService,
} from './gcpLivePricingService.js';

export { getLivePricingForService, getLivePricingOptions, resolveInstanceTypeForService };

export function listRegionNames() {
  return GCP_SYNC_REGIONS.map((code) => ({
    code,
    name: GCP_REGION_NAMES[code] || code,
  }));
}

export async function isEnabledRegion(region) {
  return GCP_SYNC_REGIONS.includes(region);
}

export async function getPricingOptions(serviceId, region) {
  return getLivePricingOptions(serviceId, region);
}

export async function getPricingForService(service, instanceType, region) {
  return getLivePricingForService(service, instanceType, region);
}

export async function getAvailableRegions(serviceIds, instanceSelections = '') {
  const ids = String(serviceIds || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) return [];

  const selectionMap = new Map();
  if (instanceSelections) {
    for (const part of String(instanceSelections).split(',')) {
      const [serviceId, instanceType] = part.split(':');
      if (serviceId && instanceType) selectionMap.set(serviceId.trim(), instanceType.trim());
    }
  }

  const regions = listRegionNames();
  const results = [];

  for (const region of regions) {
    let basePrice = 0;
    let available = true;

    for (const serviceId of ids) {
      const service = await Service.findById(serviceId).lean();
      if (!service) {
        available = false;
        break;
      }

      const instanceType =
        selectionMap.get(serviceId) ||
        resolveInstanceTypeForService(service, Object.fromEntries(selectionMap));
      const pricing = await getLivePricingForService(service, instanceType, region.code);
      if (!pricing) {
        available = false;
        break;
      }
      basePrice += Number(pricing.pricePerHour || 0);
    }

    if (available) {
      results.push({
        code: region.code,
        name: region.name,
        location: region.name,
        basePrice: Number(basePrice.toFixed(4)),
        currency: 'USD',
      });
    }
  }

  return results;
}
