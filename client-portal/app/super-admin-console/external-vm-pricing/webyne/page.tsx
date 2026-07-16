'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw, Save } from 'lucide-react';
import {
  getPricing,
  type CatalogPlan,
  type CatalogType,
} from '@/lib/createVmCatalogApi';
import {
  getExternalVmPricing,
  saveExternalVmPricing,
  type ExternalVmPricingConfig,
} from '@/lib/externalVmPricingApi';
import { reconcilePlansAgainstCatalog } from '@/lib/catalogPricingMerge';

const TABS: { id: CatalogType; label: string }[] = [
  { id: 'linux', label: 'Linux' },
  { id: 'windows', label: 'Windows' },
  { id: 'gpu', label: 'GPU' },
];

const PERIODS = ['hourly', 'monthly', 'quarterly', 'yearly'] as const;
const PERIOD_LABELS: Record<(typeof PERIODS)[number], string> = {
  hourly: 'Hourly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};
type PeriodKey = (typeof PERIODS)[number];
type OverrideRow = Partial<Record<PeriodKey, string>>;

function parseScrapedAmount(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function displayPrice(value: string | null | undefined) {
  if (value == null || String(value).trim() === '') return '—';
  return String(value).trim();
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function emptyCategories(): ExternalVmPricingConfig['categories'] {
  return {
    linux: { multiplier: 1, plans: {} },
    windows: { multiplier: 1, plans: {} },
    gpu: { multiplier: 1, plans: {} },
  };
}

export default function WebynePricingPage() {
  const [activeType, setActiveType] = useState<CatalogType>('linux');
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /** Draft overrides keyed by `${category}:${planId}` */
  const [overrides, setOverrides] = useState<Record<string, OverrideRow>>({});
  const [multipliers, setMultipliers] = useState<Record<CatalogType, string>>({
    linux: '1',
    windows: '1',
    gpu: '1',
  });
  const [storeLoaded, setStoreLoaded] = useState(false);

  const globalMultiplier = multipliers[activeType];

  const hydrateFromStore = useCallback((state: ExternalVmPricingConfig) => {
    setSavedAt(state.updatedAt);
    const nextMultipliers: Record<CatalogType, string> = {
      linux: String(state.categories.linux?.multiplier ?? 1),
      windows: String(state.categories.windows?.multiplier ?? 1),
      gpu: String(state.categories.gpu?.multiplier ?? 1),
    };
    setMultipliers(nextMultipliers);

    const nextOverrides: Record<string, OverrideRow> = {};
    (['linux', 'windows', 'gpu'] as CatalogType[]).forEach((cat) => {
      const plansMap = state.categories[cat]?.plans ?? {};
      for (const [planId, row] of Object.entries(plansMap)) {
        nextOverrides[`${cat}:${planId}`] = { ...row };
      }
    });
    setOverrides(nextOverrides);
  }, []);

  const loadStore = useCallback(async () => {
    try {
      const state = await getExternalVmPricing('webyne');
      hydrateFromStore(state);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load pricing config from database.'
      );
    } finally {
      setStoreLoaded(true);
    }
  }, [hydrateFromStore]);

  const loadPlans = useCallback(async (type: CatalogType) => {
    setActiveType(type);
    setLoading(true);
    setError(null);
    try {
      // Always show raw scraped values in admin columns.
      const data = await getPricing(type, { raw: true });
      const live = data.plans || [];
      setPlans(live);
      setFetchedAt(data.fetchedAt || null);

      // Drop draft overrides for removed plans / blank periods on this tab.
      setOverrides((prev) => {
        const next = { ...prev };
        const liveIds = new Set(
          live.filter((p) => p.planId != null).map((p) => String(p.planId))
        );
        for (const key of Object.keys(next)) {
          if (!key.startsWith(`${type}:`)) continue;
          const planId = key.slice(type.length + 1);
          if (!liveIds.has(planId)) {
            delete next[key];
            continue;
          }
          const livePlan = live.find((p) => String(p.planId) === planId);
          if (!livePlan) {
            delete next[key];
            continue;
          }
          const row = { ...next[key] };
          for (const period of PERIODS) {
            if (livePlan[period] == null || String(livePlan[period]).trim() === '') {
              delete row[period];
            }
          }
          if (Object.keys(row).length === 0) delete next[key];
          else next[key] = row;
        }
        return next;
      });
    } catch (err) {
      setPlans([]);
      setFetchedAt(null);
      setError(err instanceof Error ? err.message : 'Failed to load catalog plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStore();
    void loadPlans('linux');
  }, [loadStore, loadPlans]);

  function hasScrapedPeriod(plan: CatalogPlan, period: PeriodKey): boolean {
    return plan[period] != null && String(plan[period]).trim() !== '';
  }

  function overrideKey(planId: string | number | null | undefined) {
    return `${activeType}:${planId ?? ''}`;
  }

  function setOverrideField(
    planId: string | number | null | undefined,
    field: PeriodKey,
    value: string,
    plan: CatalogPlan
  ) {
    if (planId == null) return;
    if (!hasScrapedPeriod(plan, field)) return;
    const key = overrideKey(planId);
    setOverrides((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  function applyGlobalMultiplierToList() {
    const factor = Number(globalMultiplier);
    if (!Number.isFinite(factor) || factor <= 0) {
      setError('Enter a valid multiplier (e.g. 2 or 3).');
      return;
    }
    const next: Record<string, OverrideRow> = { ...overrides };

    for (const p of plans) {
      if (p.planId == null) continue;
      const key = overrideKey(p.planId);
      const row: OverrideRow = {};
      for (const period of PERIODS) {
        if (!hasScrapedPeriod(p, period)) continue;
        const base = parseScrapedAmount(p[period]);
        if (base == null) continue;
        row[period] = formatAmount(base * factor);
      }
      if (Object.keys(row).length) next[key] = row;
      else delete next[key];
    }

    setOverrides(next);
    setError(null);
    setSuccess(null);
  }

  function clearListOverrides() {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const p of plans) {
        if (p.planId == null) continue;
        delete next[overrideKey(p.planId)];
      }
      return next;
    });
    setMultipliers((prev) => ({ ...prev, [activeType]: '1' }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let existing = emptyCategories();
      try {
        const current = await getExternalVmPricing('webyne');
        existing = {
          linux: current.categories.linux ?? emptyCategories().linux,
          windows: current.categories.windows ?? emptyCategories().windows,
          gpu: current.categories.gpu ?? emptyCategories().gpu,
        };
      } catch {
        /* first save */
      }

      // Live scrape all categories so removed plans/periods are purged from Mongo.
      const liveByCategory = await Promise.all(
        (['linux', 'windows', 'gpu'] as CatalogType[]).map(async (cat) => {
          try {
            const data = await getPricing(cat, { raw: true });
            return [cat, data.plans || []] as const;
          } catch {
            return [cat, [] as CatalogPlan[]] as const;
          }
        })
      );

      const categories = emptyCategories();
      let prunedPlans = 0;
      let prunedPeriods = 0;

      for (const [cat, livePlans] of liveByCategory) {
        const fromDraft: Record<string, OverrideRow> = {};
        for (const [key, row] of Object.entries(overrides)) {
          if (!key.startsWith(`${cat}:`)) continue;
          const planId = key.slice(cat.length + 1);
          const cleaned: OverrideRow = {};
          for (const period of PERIODS) {
            const v = row?.[period];
            if (v != null && String(v).trim() !== '') cleaned[period] = String(v).trim();
          }
          if (Object.keys(cleaned).length) fromDraft[planId] = cleaned;
        }

        // Prefer draft rows for active category; merge with existing for others.
        const sourcePlans =
          cat === activeType
            ? fromDraft
            : { ...(existing[cat]?.plans ?? {}), ...fromDraft };

        const beforePlanCount = Object.keys(sourcePlans).length;
        const beforePeriodCount = Object.values(sourcePlans).reduce(
          (n, row) => n + Object.keys(row || {}).length,
          0
        );

        const reconciled = reconcilePlansAgainstCatalog(
          sourcePlans,
          livePlans as unknown as Array<Record<string, unknown>>
        );

        prunedPlans += Math.max(0, beforePlanCount - Object.keys(reconciled).length);
        const afterPeriodCount = Object.values(reconciled).reduce(
          (n, row) => n + Object.keys(row || {}).length,
          0
        );
        prunedPeriods += Math.max(0, beforePeriodCount - afterPeriodCount);

        categories[cat] = {
          multiplier: Number(multipliers[cat]) || 1,
          plans: reconciled,
        };
      }

      // Active tab: if live scrape is loaded in UI, force reconcile draft-only (no stale merge).
      if (plans.length > 0) {
        const fromDraft: Record<string, OverrideRow> = {};
        for (const [key, row] of Object.entries(overrides)) {
          if (!key.startsWith(`${activeType}:`)) continue;
          const planId = key.slice(activeType.length + 1);
          const cleaned: OverrideRow = {};
          for (const period of PERIODS) {
            const v = row?.[period];
            if (v != null && String(v).trim() !== '') cleaned[period] = String(v).trim();
          }
          if (Object.keys(cleaned).length) fromDraft[planId] = cleaned;
        }
        categories[activeType] = {
          multiplier: Number(multipliers[activeType]) || 1,
          plans: reconcilePlansAgainstCatalog(
            fromDraft,
            plans as unknown as Array<Record<string, unknown>>
          ),
        };
      }

      const saved = await saveExternalVmPricing('webyne', categories);
      hydrateFromStore(saved);

      const cleanupNote =
        prunedPlans > 0 || prunedPeriods > 0
          ? ` Cleaned ${prunedPlans} removed plan(s) and ${prunedPeriods} missing period override(s).`
          : '';
      setSuccess(
        `Pricing overrides saved to the database.${cleanupNote} Create VM will use these sell prices.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save overrides.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/super-admin-console/external-vm-pricing"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#B91C1C]"
          >
            <ArrowLeft className="h-4 w-4" />
            External VM Pricing
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Webyne Pricing</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Set a multiplier (×2, ×3, …) or per-plan overrides, then save so Create VM shows them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadPlans(activeType)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh catalog
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !storeLoaded}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a01717] disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save overrides
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Global multiplier (all plans in this list)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">×</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={globalMultiplier}
                onChange={(e) =>
                  setMultipliers((prev) => ({ ...prev, [activeType]: e.target.value }))
                }
                className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
                placeholder="2"
              />
              <div className="flex gap-1">
                {['2', '3', '4'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setMultipliers((prev) => ({ ...prev, [activeType]: preset }))
                    }
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                      globalMultiplier === preset
                        ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    ×{preset}
                  </button>
                ))}
              </div>
            </div>
          </label>
          <button
            type="button"
            onClick={applyGlobalMultiplierToList}
            disabled={loading || plans.length === 0}
            className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a01717] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Fill row overrides
          </button>
          <button
            type="button"
            onClick={clearListOverrides}
            disabled={plans.length === 0}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Clear list overrides
          </button>
          <p className="basis-full text-xs text-gray-400 sm:basis-auto sm:ml-1">
            Empty scraped periods show N/A (column missing on Webyne). Save reconciles Mongo
            against the live catalog and drops removed plans/periods.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const on = tab.id === activeType;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => void loadPlans(tab.id)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                on
                  ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                  : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
        <div>
          <span className="mr-1.5 font-mono text-[0.72rem] uppercase tracking-wider text-gray-400">
            Fetched
          </span>
          {fetchedAt ? new Date(fetchedAt).toLocaleString() : '—'}
        </div>
        <div>
          <span className="mr-1.5 font-mono text-[0.72rem] uppercase tracking-wider text-gray-400">
            Plans
          </span>
          <strong className="text-gray-800">{plans.length}</strong>
        </div>
        <div>
          <span className="mr-1.5 font-mono text-[0.72rem] uppercase tracking-wider text-gray-400">
            Saved
          </span>
          {savedAt ? new Date(savedAt).toLocaleString() : 'Not saved yet'}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-gray-50 text-[0.74rem] font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-3 py-3" rowSpan={2}>
                Plan
              </th>
              <th className="px-3 py-3" rowSpan={2}>
                Specs
              </th>
              {PERIODS.map((period) => (
                <th
                  key={`h-${period}`}
                  className="border-l border-gray-200 px-3 py-2 text-center"
                  colSpan={2}
                >
                  {PERIOD_LABELS[period]}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-50 text-[0.7rem] font-semibold uppercase tracking-wider text-gray-400">
              {PERIODS.map((period) => (
                <Fragment key={`sub-${period}`}>
                  <th className="border-l border-gray-200 px-3 py-2 font-medium">Scraped</th>
                  <th className="px-3 py-2 font-medium">Override</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center text-gray-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
                    Loading {activeType} plans…
                  </span>
                </td>
              </tr>
            )}
            {!loading && plans.length === 0 && !error && (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center text-gray-500">
                  No plans available.
                </td>
              </tr>
            )}
            {!loading &&
              plans.map((p, idx) => {
                const key = overrideKey(p.planId);
                const row = overrides[key] ?? {};
                return (
                  <tr
                    key={`${p.planId ?? p.plan}-${idx}`}
                    className="border-t border-gray-100 align-top hover:bg-red-50/30"
                  >
                    <td className="px-3 py-3">
                      <div className="font-semibold text-gray-900">{p.plan}</div>
                      <div className="mt-0.5 font-mono text-xs text-gray-400">
                        ID {p.planId ?? '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      <div>{p.cpu || '—'}</div>
                      <div>{p.ram || '—'}</div>
                      <div>{p.disk || '—'}</div>
                    </td>
                    {PERIODS.map((field) => (
                      <Fragment key={field}>
                        <td className="border-l border-gray-100 px-3 py-3 font-mono text-gray-700">
                          {displayPrice(p[field])}
                        </td>
                        <td className="px-3 py-3">
                          {hasScrapedPeriod(p, field) ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Keep"
                              value={row[field] ?? ''}
                              disabled={p.planId == null}
                              onChange={(e) =>
                                setOverrideField(p.planId, field, e.target.value, p)
                              }
                              className="w-24 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40 disabled:bg-gray-50"
                            />
                          ) : (
                            <span className="text-xs text-gray-300">N/A</span>
                          )}
                        </td>
                      </Fragment>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Overrides are stored in MongoDB. Save reconciles against the live Webyne catalog
        (drops removed plans and blank periods). Create VM never resurrects a missing column
        via a sticky override.
      </p>
    </div>
  );
}
