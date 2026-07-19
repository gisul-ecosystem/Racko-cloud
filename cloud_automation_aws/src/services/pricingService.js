import Service from '../models/Service.js';
import { isSharedCosting } from '../utils/costingMode.js';
import { computeBillableHours } from '../utils/billableHours.js';
import {
  getLivePricingForService,
  getLivePricingOptions,
  resolveInstanceTypeForService,
} from './awsLivePricingService.js';

export const getPricingForService = async (serviceId, region) => {
  return getLivePricingOptions(serviceId, region);
};

function resolvePricePerHour(pricing) {
  const hourly = Number(pricing?.pricePerHour);
  if (Number.isFinite(hourly) && hourly > 0) {
    return hourly;
  }

  const daily = Number(pricing?.pricePerDay);
  if (Number.isFinite(daily) && daily > 0) {
    return daily / 24;
  }

  return 0;
}

/**
 * Azure-parity estimate:
 * total = billableHours × (infraHourly × shared?1:N + flatRateHourly × N)
 *
 * - instance / infra services → shared lab multiplies by 1 (or by N in per_user)
 * - flat_rate / usage tiers → always × accountCount (like Azure portal fees)
 */
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

export const calculateEstimate = async ({
  serviceIds,
  region,
  accountCount,
  instanceSelections = [],
  startDate,
  endDate,
  usageWindows = [],
  costingMode = 'shared',
  // legacy fallback when dates are not provided
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
    if (days <= 0) {
      throw new Error('startDate/endDate or durationDays is required');
    }
    durationHours = days * 24;
    calendarHours = durationHours;
    billableHours = durationHours;
  }

  const durationDays = Number((durationHours / 24).toFixed(2));
  const selectionMap = new Map(
    instanceSelections.map((entry) => [String(entry.serviceId), entry.instanceType])
  );
  const selectedInstancesByServiceId = Object.fromEntries(selectionMap);

  const breakdown = [];
  let infraHourlyTotal = 0;
  let portalHourlyTotal = 0;
  let total = 0;

  for (const serviceId of serviceIds) {
    const service = await Service.findById(serviceId).lean();
    if (!service) continue;

    const selectedInstance =
      selectionMap.get(String(serviceId)) ||
      resolveInstanceTypeForService(service, selectedInstancesByServiceId);

    const pricing = await getLivePricingForService(service, selectedInstance, region);
    if (!pricing) continue;

    const pricePerHour = resolvePricePerHour(pricing);
    const pricePerDay = Number(pricing.pricePerDay) || Number((pricePerHour * 24).toFixed(6));
    const isFlatRate = service.pricingType === 'flat_rate' || Boolean(pricing.flatRate);

    if (isFlatRate) {
      portalHourlyTotal += pricePerHour;
    } else {
      infraHourlyTotal += pricePerHour;
    }

    const { accountMultiplier, cost } = computeServiceCost({
      pricingType: isFlatRate ? 'flat_rate' : 'instance',
      pricePerHour,
      durationHours,
      accountCount: resolvedAccountCount,
      costingMode,
    });

    breakdown.push({
      serviceName: service.name,
      instanceType: pricing.instanceType,
      label: pricing.label || null,
      pricingType: isFlatRate ? 'flat_rate' : 'instance',
      pricePerHour: Number(pricePerHour.toFixed(6)),
      pricePerDay,
      priceUnit: pricing.priceUnit,
      unitPrice: pricing.unitPrice ?? 0,
      flatRate: isFlatRate,
      estimated: Boolean(pricing.estimated),
      accountCount: resolvedAccountCount,
      accountMultiplier,
      durationHours: Number(durationHours.toFixed(2)),
      durationDays,
      cost: Number(cost.toFixed(2)),
    });
    total += cost;
  }

  const sharedInfra = isSharedCosting(costingMode);
  const infraMultiplier = sharedInfra ? 1 : resolvedAccountCount;
  const baseHourlyPrice = Number(
    (infraHourlyTotal + portalHourlyTotal).toFixed(6)
  );
  const effectiveHourlyRate = Number(
    (infraHourlyTotal * infraMultiplier + portalHourlyTotal * resolvedAccountCount).toFixed(6)
  );

  return {
    total: parseFloat(total.toFixed(2)),
    totalPrice: parseFloat(total.toFixed(2)),
    breakdown,
    accounts: resolvedAccountCount,
    accountCount: resolvedAccountCount,
    costingMode: sharedInfra ? 'shared' : 'per_user',
    currency: 'USD',
    durationHours: Number(durationHours.toFixed(2)),
    calendarHours: Number((calendarHours ?? durationHours).toFixed(2)),
    billableHours: Number((billableHours ?? durationHours).toFixed(2)),
    usesUsageWindows,
    duration: durationDays,
    durationDays,
    baseHourlyPrice: Number(baseHourlyPrice.toFixed(4)),
    infraHourlyTotal: Number(infraHourlyTotal.toFixed(6)),
    portalHourlyTotal: Number(portalHourlyTotal.toFixed(6)),
    effectiveHourlyRate: Number(effectiveHourlyRate.toFixed(4)),
  };
};
