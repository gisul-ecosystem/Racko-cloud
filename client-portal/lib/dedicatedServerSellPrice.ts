import type { IDedicatedPlan } from './dedicatedServerApi';

export const DEDICATED_GST_RATE = 0.18;

export function applyDedicatedSellMultiplier(
  base: number | null | undefined,
  multiplier: number
): number | null {
  if (base == null || !Number.isFinite(Number(base))) return null;
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return Math.round(Number(base) * m * 100) / 100;
}

export function dedicatedPlanSellMonthly(plan: IDedicatedPlan, multiplier: number): number {
  return applyDedicatedSellMultiplier(plan.monthlyPrice, multiplier) ?? 0;
}

export function dedicatedPlanSellSetup(plan: IDedicatedPlan, multiplier: number): number | null {
  return applyDedicatedSellMultiplier(plan.setupFee, multiplier);
}

export function dedicatedPlanCheckoutTotals(plan: IDedicatedPlan, multiplier: number) {
  const monthly = dedicatedPlanSellMonthly(plan, multiplier);
  const setup = dedicatedPlanSellSetup(plan, multiplier) ?? 0;
  const subtotal = Math.round((monthly + setup) * 100) / 100;
  const tax = Math.round(subtotal * DEDICATED_GST_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { monthly, setup, subtotal, tax, total };
}

/** @deprecated Use dedicatedPlanCheckoutTotals().total */
export function dedicatedPlanFirstCharge(plan: IDedicatedPlan, multiplier: number): number {
  return dedicatedPlanCheckoutTotals(plan, multiplier).total;
}
