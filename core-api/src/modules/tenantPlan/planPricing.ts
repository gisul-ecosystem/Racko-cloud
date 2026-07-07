import mongoose from 'mongoose';
import type { BillingPeriod } from '../../models/order.model';
import type { IOrderSpecs } from '../../models/order.model';
import { TenantServiceConfig } from '../../models/tenantServiceConfig.model';
import { AppError } from '../../utils/errors';

interface VmManagementPricing {
  cpuRatePerCoreMonthly: number;
  ramRatePerGbMonthly: number;
  diskRatePerGbMonthly: number;
}

interface BillingDiscounts {
  quarterly: number;
  yearly: number;
}

function getBillingDiscounts(pricing: Record<string, unknown>): BillingDiscounts {
  const raw = pricing['billingDiscounts'] as Record<string, unknown> | undefined;
  return {
    quarterly: typeof raw?.['quarterly'] === 'number' ? raw['quarterly'] : 0,
    yearly: typeof raw?.['yearly'] === 'number' ? raw['yearly'] : 0,
  };
}

function applyBillingPeriodMultiplier(
  monthlyAmount: number,
  billingPeriod: BillingPeriod,
  discounts: BillingDiscounts
): number {
  if (billingPeriod === 'monthly') return monthlyAmount;
  if (billingPeriod === 'quarterly') return monthlyAmount * 3 * (1 - discounts.quarterly);
  return monthlyAmount * 12 * (1 - discounts.yearly);
}

function computePerVmCost(specs: IOrderSpecs, pricing: VmManagementPricing): number {
  return (
    specs.cpuCores * pricing.cpuRatePerCoreMonthly +
    specs.memoryGb * pricing.ramRatePerGbMonthly +
    specs.diskGb * pricing.diskRatePerGbMonthly
  );
}

export async function calculateVmPlanPeriodAmount(
  tenantId: string,
  specs: IOrderSpecs,
  billingPeriod: BillingPeriod
): Promise<number> {
  const config = await TenantServiceConfig.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    serviceKey: 'vm-management',
    status: 'active',
  }).lean();

  if (!config) {
    throw new AppError('SERVICE_NOT_ENABLED', 404, 'SERVICE_NOT_ENABLED');
  }

  const pricing = config.pricing as unknown as VmManagementPricing;
  const discounts = getBillingDiscounts(config.pricing as Record<string, unknown>);
  const monthly = computePerVmCost(specs, pricing);
  return applyBillingPeriodMultiplier(monthly, billingPeriod, discounts);
}
