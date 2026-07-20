import type { IVmCatalogPlan } from './vmCatalogApi';
import type { VmCatalogCategory } from './vmCatalogApi';
import type { ExternalVmPricingConfig } from './externalVmPricingApi';

export type BillingPeriod = 'hourly' | 'monthly' | 'quarterly' | 'yearly';

/** Prefer a shared global multiplier; fall back to linux then 1. */
export function getGlobalSellMultiplier(config: ExternalVmPricingConfig | null): number {
  if (!config) return 1;
  const linux = Number(config.categories.linux?.multiplier);
  const windows = Number(config.categories.windows?.multiplier);
  const gpu = Number(config.categories.gpu?.multiplier);
  const candidates = [linux, windows, gpu].filter((n) => Number.isFinite(n) && n > 0);
  if (candidates.length === 0) return 1;
  // If all equal, use that; otherwise use linux (canonical for global UI).
  if (candidates.every((n) => n === candidates[0])) return candidates[0]!;
  return Number.isFinite(linux) && linux > 0 ? linux : candidates[0]!;
}

export function getCategorySellMultiplier(
  config: ExternalVmPricingConfig | null,
  category: VmCatalogCategory
): number {
  if (!config) return 1;
  const n = Number(config.categories[category]?.multiplier);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function applySellMultiplier(
  base: number | null | undefined,
  multiplier: number
): number | null {
  if (base == null || !Number.isFinite(Number(base))) return null;
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const out = Number(base) * m;
  return Math.round(out * 100) / 100;
}

export function sellPriceForPeriod(
  plan: IVmCatalogPlan,
  period: BillingPeriod,
  multiplier: number
): number | null {
  return applySellMultiplier(plan[period], multiplier);
}
