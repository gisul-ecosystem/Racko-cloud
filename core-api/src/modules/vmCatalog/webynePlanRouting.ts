/**
 * Catalog plan names that live on Webyne Linux pricing
 * (https://cloud.webyne.com/admin/linux/pricing) — keep in sync with
 * create-vm-catalog-agent/lib/catalog-session.js LINUX_PRICING_PLANS.
 */
export const LINUX_PRICING_PLANS = [
  'PG LARGE',
  'GISUL 8VCPU 32GB RAM 500GB',
  'Package 4-10 CORE 20 GB RAM 500 GB DISK',
  'Gold Cloud 2',
  'Gold Cloud 3',
  'Gold Cloud 5',
  'Gold Cloud 6',
  'Gold Cloud 7',
] as const;

export function normalizePlanName(name: string): string {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Webyne pricing page for this catalog plan name. */
export function resolvePricingCategory(planName: string): 'linux' | 'windows' {
  const target = normalizePlanName(planName);
  if (!target) return 'linux';
  const onLinux = LINUX_PRICING_PLANS.some((plan) => normalizePlanName(plan) === target);
  return onLinux ? 'linux' : 'windows';
}

/**
 * Sell-price / multiplier bucket for a catalog OS choice.
 * Ubuntu / Rocky / Debian (and legacy linux) use Linux pricing multipliers.
 */
export function catalogPricingBucket(
  category: string
): 'linux' | 'windows' | 'gpu' {
  const c = String(category || '').toLowerCase();
  if (c === 'windows') return 'windows';
  if (c === 'gpu') return 'gpu';
  return 'linux';
}

/**
 * True when admin/tenant asked for Windows but the plan must be purchased
 * from Linux pricing first — SA must later change OS on machineshow.
 */
export function needsOsTemplateChange(
  planName: string,
  category: string
): boolean {
  return (
    String(category || '').toLowerCase() === 'windows' &&
    resolvePricingCategory(planName) === 'linux'
  );
}
