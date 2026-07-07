import Service from '../models/Service.js';
import {
  getLivePricingForService,
  getLivePricingOptions,
  parseInstanceSelections,
  resolveInstanceTypeForService,
} from './awsLivePricingService.js';

export const getPricingForService = async (serviceId, region) => {
  return getLivePricingOptions(serviceId, region);
};

export const calculateEstimate = async ({
  serviceIds,
  region,
  accountCount,
  durationDays,
  instanceSelections = [],
}) => {
  const breakdown = [];
  let total = 0;

  const selectionMap = new Map(
    instanceSelections.map((entry) => [String(entry.serviceId), entry.instanceType])
  );
  const selectedInstancesByServiceId = Object.fromEntries(selectionMap);

  for (const serviceId of serviceIds) {
    const service = await Service.findById(serviceId).lean();
    if (!service) continue;

    const selectedInstance =
      selectionMap.get(String(serviceId)) ||
      resolveInstanceTypeForService(service, selectedInstancesByServiceId);

    const pricing = await getLivePricingForService(service, selectedInstance, region);
    if (!pricing) continue;

    if (service.pricingType === 'flat_rate') {
      const pricePerDay = pricing.unitPrice || 0;
      const cost = pricePerDay * durationDays;
      breakdown.push({
        serviceName: service.name,
        instanceType: pricing.instanceType,
        pricePerDay,
        priceUnit: pricing.priceUnit,
        unitPrice: pricing.unitPrice ?? 0,
        flatRate: true,
        accountCount,
        durationDays,
        cost,
      });
      total += cost;
      continue;
    }

    const cost = pricing.pricePerDay * accountCount * durationDays;
    breakdown.push({
      serviceName: service.name,
      instanceType: pricing.instanceType,
      pricePerDay: pricing.pricePerDay,
      accountCount,
      durationDays,
      cost,
    });
    total += cost;
  }

  return { total: parseFloat(total.toFixed(2)), breakdown };
};
