import ServicePricing from '../models/ServicePricing.js';
import Service from '../models/Service.js';

export const getPricingForService = async (serviceId, region) => {
  return ServicePricing.find({ serviceId, region }).sort({ pricePerHour: 1 }).lean();
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

  for (const serviceId of serviceIds) {
    const service = await Service.findById(serviceId).lean();
    if (!service) continue;

    const selectedInstance = selectionMap.get(String(serviceId));
    let pricing;

    if (selectedInstance) {
      pricing = await ServicePricing.findOne({ serviceId, region, instanceType: selectedInstance }).lean();
    } else {
      pricing = await ServicePricing.findOne({ serviceId, region, pricePerHour: { $gt: 0 } })
        .sort({ pricePerHour: 1 })
        .lean();
    }

    if (!pricing) continue;

    if (service.pricingType === 'flat_rate') {
      breakdown.push({
        serviceName: pricing.serviceName,
        instanceType: pricing.instanceType,
        pricePerDay: 0,
        priceUnit: pricing.priceUnit,
        unitPrice: pricing.unitPrice ?? 0,
        flatRate: true,
        accountCount,
        durationDays,
        cost: 0,
      });
      continue;
    }

    const cost = pricing.pricePerDay * accountCount * durationDays;
    breakdown.push({
      serviceName: pricing.serviceName,
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
