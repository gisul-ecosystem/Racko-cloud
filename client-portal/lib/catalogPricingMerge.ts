export type CatalogCategory = 'linux' | 'windows' | 'gpu';
export type CatalogPeriod = 'hourly' | 'monthly' | 'quarterly' | 'yearly';

export type PlanPeriodOverrides = Partial<Record<CatalogPeriod, string>>;

export interface CategoryOverrides {
  multiplier: number;
  plans: Record<string, PlanPeriodOverrides>;
}

export interface WebyneOverridesState {
  provider?: 'webyne';
  updatedAt: string | null;
  updatedBy?: string | null;
  categories: Record<CatalogCategory, CategoryOverrides>;
}

const PERIODS: CatalogPeriod[] = ['hourly', 'monthly', 'quarterly', 'yearly'];
const CATEGORIES: CatalogCategory[] = ['linux', 'windows', 'gpu'];

export function emptyWebyneOverridesState(): WebyneOverridesState {
  return {
    provider: 'webyne',
    updatedAt: null,
    updatedBy: null,
    categories: {
      linux: { multiplier: 1, plans: {} },
      windows: { multiplier: 1, plans: {} },
      gpu: { multiplier: 1, plans: {} },
    },
  };
}

function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function hasScrapedPeriodValue(raw: unknown): boolean {
  return raw != null && String(raw).trim() !== '';
}

/**
 * Drop overrides for plans / periods that no longer exist on the live scrape.
 * - Removed planId → removed from overrides
 * - Empty scraped period (column gone) → drop that period override
 */
export function reconcilePlansAgainstCatalog(
  storedPlans: Record<string, PlanPeriodOverrides>,
  livePlans: Array<Record<string, unknown>>
): Record<string, PlanPeriodOverrides> {
  const liveById = new Map<string, Record<string, unknown>>();
  for (const plan of livePlans) {
    if (plan.planId == null) continue;
    liveById.set(String(plan.planId), plan);
  }

  const out: Record<string, PlanPeriodOverrides> = {};
  for (const [planId, row] of Object.entries(storedPlans || {})) {
    const live = liveById.get(String(planId));
    if (!live) continue;

    const cleaned: PlanPeriodOverrides = {};
    for (const period of PERIODS) {
      if (!hasScrapedPeriodValue(live[period])) continue;
      const override = row?.[period];
      if (override == null || String(override).trim() === '') continue;
      cleaned[period] = String(override).trim();
    }
    if (Object.keys(cleaned).length > 0) {
      out[String(planId)] = cleaned;
    }
  }
  return out;
}

function resolvePeriodPrice(
  scraped: unknown,
  planOverride: string | undefined,
  multiplier: number
): string | null {
  // If Webyne removed the column / left it blank, never resurrect via sticky override.
  if (!hasScrapedPeriodValue(scraped)) {
    return null;
  }

  if (planOverride != null && String(planOverride).trim() !== '') {
    return String(planOverride).trim();
  }
  const base = parseAmount(scraped);
  if (base == null) {
    return String(scraped).trim();
  }
  if (!Number.isFinite(multiplier) || multiplier === 1) {
    return formatAmount(base);
  }
  return formatAmount(base * multiplier);
}

export function applyWebyneOverridesToPricing(
  data: Record<string, unknown>,
  state: WebyneOverridesState
): Record<string, unknown> {
  const category = String(data.category || '').toLowerCase() as CatalogCategory;
  if (!CATEGORIES.includes(category)) return data;
  const cfg = state.categories[category] ?? { multiplier: 1, plans: {} };
  const plans = Array.isArray(data.plans) ? data.plans : [];

  const mergedPlans = plans.map((plan) => {
    if (!plan || typeof plan !== 'object') return plan;
    const p = { ...(plan as Record<string, unknown>) };
    const planId = p.planId != null ? String(p.planId) : '';
    const row = planId ? cfg.plans[planId] ?? {} : {};
    for (const period of PERIODS) {
      p[period] = resolvePeriodPrice(p[period], row[period], cfg.multiplier);
    }
    return p;
  });

  return { ...data, plans: mergedPlans };
}

export function applyWebyneOverridesToCart(
  data: Record<string, unknown>,
  state: WebyneOverridesState
): Record<string, unknown> {
  const category = String(data.category || '').toLowerCase() as CatalogCategory;
  if (!CATEGORIES.includes(category)) return data;
  const cfg = state.categories[category] ?? { multiplier: 1, plans: {} };
  const planId = data.planId != null ? String(data.planId) : '';
  const row = planId ? cfg.plans[planId] ?? {} : {};

  const amountsIn =
    data.amounts && typeof data.amounts === 'object'
      ? (data.amounts as Record<string, unknown>)
      : {};
  const amounts: Record<string, number | null> = {};
  for (const period of PERIODS) {
    const resolved = resolvePeriodPrice(amountsIn[period], row[period], cfg.multiplier);
    amounts[period] = parseAmount(resolved);
  }

  const cycles = Array.isArray(data.billingCycles) ? data.billingCycles : [];
  const billingCycles = cycles.map((cycle) => {
    if (!cycle || typeof cycle !== 'object') return cycle;
    const c = { ...(cycle as Record<string, unknown>) };
    const value = String(c.value || '').toLowerCase();
    const period = PERIODS.find((p) => p === value);
    if (period && amounts[period] != null) {
      c.amount = amounts[period];
    } else if (Number.isFinite(cfg.multiplier) && cfg.multiplier !== 1) {
      const base = parseAmount(c.amount);
      if (base != null) c.amount = Number(formatAmount(base * cfg.multiplier));
    }
    return c;
  });

  const selectedBilling = String(data.selectedBilling || '').toLowerCase();
  const selectedPeriod = PERIODS.find((p) => p === selectedBilling);
  const quantity = Math.max(1, Number(data.quantity) || 1);
  const selectedCycle = billingCycles.find(
    (c) =>
      c &&
      typeof c === 'object' &&
      String((c as Record<string, unknown>).value || '').toLowerCase() === selectedBilling
  ) as Record<string, unknown> | undefined;

  const unit =
    (selectedPeriod ? amounts[selectedPeriod] : null) ?? parseAmount(selectedCycle?.amount);

  let pricing = data.pricing;
  if (unit != null && pricing && typeof pricing === 'object') {
    const subtotal = unit * quantity;
    const tax = Math.round(subtotal * 0.18 * 1000) / 1000;
    const total = Math.round((subtotal + tax) * 1000) / 1000;
    pricing = {
      ...(pricing as Record<string, unknown>),
      subtotal,
      tax,
      total,
    };
  }

  return {
    ...data,
    amounts,
    billingCycles,
    pricing,
  };
}
