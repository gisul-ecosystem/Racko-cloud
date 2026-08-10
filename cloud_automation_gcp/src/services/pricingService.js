import Service from '../models/Service.js';
import { isSharedCosting } from '../utils/costingMode.js';
import { computeBillableHours } from '../utils/billableHours.js';
import {
  getLivePricingForService,
  getLivePricingOptions,
  resolveInstanceTypeForService,
} from './gcpLivePricingService.js';

function resolvePricePerHour(pricing) {
  const hourly = Number(pricing?.pricePerHour);
  if (Number.isFinite(hourly) && hourly > 0) return hourly;

  const daily = Number(pricing?.pricePerDay);
  if (Number.isFinite(daily) && daily > 0) return daily / 24;

  return 0;
}

export function computeServiceCost({
  pricingType,
  pricePerHour,
  durationHours,
  accountCount,
  costingMode = 'shared',
}) {
  const sharedInfra = isSharedCosting(costingMode);
  const isFlatRate = pricingType === 'flat_rate';
  const accountMultiplier = isFlatRate || !sharedInfra ? accountCount : 1;

  return {
    accountMultiplier,
    cost: Number((pricePerHour * durationHours * accountMultiplier).toFixed(6)),
  };
}

export const getPricingForServiceRoute = async (serviceId, region) => {
  return getLivePricingOptions(serviceId, region);
};

export const calculateEstimate = async ({
  serviceIds,
  region,
  accountCount,
  instanceSelections = [],
  startDate,
  endDate,
  usageWindows = [],
  costingMode = 'shared',
  durationDays: legacyDurationDays,
}) => {
  const resolvedAccountCount = Number(accountCount);
  if (!Number.isInteger(resolvedAccountCount) || resolvedAccountCount <= 0) {
    throw new Error('accountCount must be a positive integer.');
  }

  let calendarHours;
  let billableHours;
  let usesUsageWindows = false;
  let durationHours;

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new Error('endDate must be on or after startDate');
    }

    const hours = computeBillableHours(start, end, usageWindows);
    calendarHours = hours.calendarHours;
    billableHours = hours.billableHours;
    usesUsageWindows = hours.usesUsageWindows;
    durationHours = billableHours;
  } else {
    const days = Number(legacyDurationDays) || 0;
    if (days <= 0) throw new Error('startDate/endDate or durationDays is required');
    durationHours = days * 24;
    calendarHours = durationHours;
    billableHours = durationHours;
  }

  const selectionMap = new Map(
    instanceSelections.map((entry) => [String(entry.serviceId), entry.instanceType])
  );

  const breakdown = [];
  let total = 0;

  for (const serviceId of serviceIds) {
    const service = await Service.findById(serviceId).lean();
    if (!service) continue;

    const selectedInstance =
      selectionMap.get(String(serviceId)) ||
      resolveInstanceTypeForService(service, Object.fromEntries(selectionMap));

    const pricing = await getLivePricingForService(service, selectedInstance, region);
    if (!pricing) continue;

    const pricePerHour = resolvePricePerHour(pricing);
    const { cost, accountMultiplier } = computeServiceCost({
      pricingType: service.pricingType,
      pricePerHour,
      durationHours,
      accountCount: resolvedAccountCount,
      costingMode,
    });

    total += cost;
    breakdown.push({
      serviceName: service.name,
      instanceType: pricing.instanceType,
      pricingType: service.pricingType,
      pricePerHour,
      pricePerDay: Number(pricing.pricePerDay) || Number((pricePerHour * 24).toFixed(6)),
      accountCount: resolvedAccountCount,
      accountMultiplier,
      durationHours,
      durationDays: Number((durationHours / 24).toFixed(2)),
      cost: Number(cost.toFixed(2)),
    });
  }

  return {
    total: Number(total.toFixed(2)),
    totalPrice: Number(total.toFixed(2)),
    breakdown,
    accountCount: resolvedAccountCount,
    costingMode,
    currency: 'USD',
    durationHours,
    calendarHours,
    billableHours,
    usesUsageWindows,
    durationDays: Number((durationHours / 24).toFixed(2)),
  };
};
