'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Search, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  deleteAccountVmPricingOverride,
  getAccountVmPricingOverride,
  listAccountVmPricingOverrides,
  saveAccountVmPricingOverride,
  searchAccountVmPricingAccounts,
  type AccountVmPricingAccount,
  type AccountVmPricingOverride,
  type AccountVmPricingProvider,
  type AccountVmPricingScopeType,
  type DedicatedPlanAbsoluteOverride,
  type PlanPeriodAbsoluteOverrides,
} from '@/lib/accountVmPricingApi';
import { fetchVmCatalogPlans, type IVmCatalogPlan } from '@/lib/vmCatalogApi';
import {
  fetchDedicatedPlans,
  fetchDedicatedPricingSettings,
  type IDedicatedPlan,
} from '@/lib/dedicatedServerApi';
import {
  getExternalVmPricing,
  type ExternalVmPricingConfig,
} from '@/lib/externalVmPricingApi';
import {
  getGlobalSellMultiplier,
  sellPriceForPeriod,
  type BillingPeriod,
} from '@/lib/vmCatalogSellPrice';
import {
  dedicatedPlanSellMonthly,
  dedicatedPlanSellSetup,
} from '@/lib/dedicatedServerSellPrice';

type TabProvider = AccountVmPricingProvider;

const MULTIPLIER_PRESETS = [1, 1.5, 2, 2.5, 3, 4, 5] as const;

function numOrEmpty(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}

function parseMultiplier(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0.01) return null;
  return n;
}

/** Allow typing decimals (e.g. "0.", "0.50") — keep as string until save. */
function isDecimalDraft(raw: string): boolean {
  return raw === '' || /^\d*\.?\d*$/.test(raw);
}

function parseOptionalPrice(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

type PlanOverrideDraft = Partial<Record<'hourly' | 'monthly' | 'quarterly' | 'yearly', string>>;
type DedicatedOverrideDraft = { monthlyPrice?: string; setupFee?: string };

function planOverridesToDraft(
  src: Record<string, PlanPeriodAbsoluteOverrides> | undefined
): Record<string, PlanOverrideDraft> {
  const out: Record<string, PlanOverrideDraft> = {};
  for (const [planId, row] of Object.entries(src || {})) {
    const draft: PlanOverrideDraft = {};
    for (const period of ['hourly', 'monthly', 'quarterly', 'yearly'] as const) {
      const v = row[period];
      if (v != null && Number.isFinite(Number(v))) draft[period] = String(v);
    }
    if (Object.keys(draft).length > 0) out[planId] = draft;
  }
  return out;
}

function planOverridesFromDraft(
  src: Record<string, PlanOverrideDraft>
): Record<string, PlanPeriodAbsoluteOverrides> {
  const out: Record<string, PlanPeriodAbsoluteOverrides> = {};
  for (const [planId, row] of Object.entries(src)) {
    const next: PlanPeriodAbsoluteOverrides = {};
    for (const period of ['hourly', 'monthly', 'quarterly', 'yearly'] as const) {
      const n = parseOptionalPrice(row[period]);
      if (n !== undefined) next[period] = n;
    }
    if (Object.keys(next).length > 0) out[planId] = next;
  }
  return out;
}

function dedicatedOverridesToDraft(
  src: Record<string, DedicatedPlanAbsoluteOverride> | undefined
): Record<string, DedicatedOverrideDraft> {
  const out: Record<string, DedicatedOverrideDraft> = {};
  for (const [planId, row] of Object.entries(src || {})) {
    const draft: DedicatedOverrideDraft = {};
    if (row.monthlyPrice != null && Number.isFinite(Number(row.monthlyPrice))) {
      draft.monthlyPrice = String(row.monthlyPrice);
    }
    if (row.setupFee != null && Number.isFinite(Number(row.setupFee))) {
      draft.setupFee = String(row.setupFee);
    }
    if (Object.keys(draft).length > 0) out[planId] = draft;
  }
  return out;
}

function dedicatedOverridesFromDraft(
  src: Record<string, DedicatedOverrideDraft>
): Record<string, DedicatedPlanAbsoluteOverride> {
  const out: Record<string, DedicatedPlanAbsoluteOverride> = {};
  for (const [planId, row] of Object.entries(src)) {
    const next: DedicatedPlanAbsoluteOverride = {};
    const monthly = parseOptionalPrice(row.monthlyPrice);
    const setup = parseOptionalPrice(row.setupFee);
    if (monthly !== undefined) next.monthlyPrice = monthly;
    if (setup !== undefined) next.setupFee = setup;
    if (Object.keys(next).length > 0) out[planId] = next;
  }
  return out;
}

export default function AccountVmPricingPage() {
  const [provider, setProvider] = useState<TabProvider>('webyne');
  const [scopeType, setScopeType] = useState<AccountVmPricingScopeType>('organization');
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<AccountVmPricingAccount[]>([]);
  const [selected, setSelected] = useState<AccountVmPricingAccount | null>(null);
  const [override, setOverride] = useState<AccountVmPricingOverride | null>(null);
  const [existingOverrides, setExistingOverrides] = useState<AccountVmPricingOverride[]>([]);
  const [catalogPlans, setCatalogPlans] = useState<IVmCatalogPlan[]>([]);
  const [dedicatedPlans, setDedicatedPlans] = useState<IDedicatedPlan[]>([]);
  const [globalWebyne, setGlobalWebyne] = useState<ExternalVmPricingConfig | null>(null);
  const [globalDedicatedMult, setGlobalDedicatedMult] = useState(1);

  const [accountMult, setAccountMult] = useState('');
  const [dedicatedMult, setDedicatedMult] = useState('');
  const [hourlyEnabled, setHourlyEnabled] = useState<'inherit' | 'on' | 'off'>('inherit');
  const [notes, setNotes] = useState('');
  const [planOverrides, setPlanOverrides] = useState<Record<string, PlanOverrideDraft>>({});
  const [dedicatedPlanOverrides, setDedicatedPlanOverrides] = useState<
    Record<string, DedicatedOverrideDraft>
  >({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const loadAccounts = useCallback(async (scope: AccountVmPricingScopeType, q: string) => {
    setSearching(true);
    try {
      const list = await searchAccountVmPricingAccounts({
        scopeType: scope,
        q: q.trim() || undefined,
        limit: 40,
      });
      setAccounts(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to search accounts.');
    } finally {
      setSearching(false);
    }
  }, []);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overrides, plans, dedicated, webyneCfg, dedicatedSettings] = await Promise.all([
        listAccountVmPricingOverrides(provider),
        fetchVmCatalogPlans().catch(() => [] as IVmCatalogPlan[]),
        fetchDedicatedPlans().catch(() => [] as IDedicatedPlan[]),
        getExternalVmPricing('webyne').catch(() => null),
        fetchDedicatedPricingSettings().catch(() => null),
      ]);
      setExistingOverrides(overrides);
      setCatalogPlans(plans);
      setDedicatedPlans(dedicated);
      setGlobalWebyne(webyneCfg);
      setGlobalDedicatedMult(
        dedicatedSettings?.sellMultiplier && dedicatedSettings.sellMultiplier > 0
          ? dedicatedSettings.sellMultiplier
          : 1
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load pricing data.');
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    void loadAccounts(scopeType, query);
  }, [scopeType, loadAccounts]);

  function applyOverrideToForm(next: AccountVmPricingOverride | null) {
    setOverride(next);
    const linux = next?.categories?.linux?.multiplier ?? null;
    const windows = next?.categories?.windows?.multiplier ?? null;
    const gpu = next?.categories?.gpu?.multiplier ?? null;
    // Prefer a shared account multiplier when categories match (or any one is set).
    const shared =
      linux != null && linux === windows && linux === gpu
        ? linux
        : linux ?? windows ?? gpu;
    setAccountMult(numOrEmpty(shared));
    setDedicatedMult(numOrEmpty(next?.categories?.default?.multiplier));
    setHourlyEnabled(
      next?.hourlyEnabled == null ? 'inherit' : next.hourlyEnabled ? 'on' : 'off'
    );
    setNotes(next?.notes || '');
    setPlanOverrides(planOverridesToDraft(next?.planOverrides));
    setDedicatedPlanOverrides(dedicatedOverridesToDraft(next?.dedicatedPlanOverrides));
  }

  async function selectAccount(account: AccountVmPricingAccount) {
    setSelected(account);
    setFlash(null);
    setError(null);
    try {
      const current = await getAccountVmPricingOverride(provider, scopeType, account.id);
      applyOverrideToForm(current);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load account override.');
    }
  }

  async function refreshOverridesList() {
    try {
      const overrides = await listAccountVmPricingOverrides(provider);
      setExistingOverrides(overrides);
    } catch {
      // Non-fatal — form already has saved state.
    }
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      if (provider === 'webyne') {
        const mult = parseMultiplier(accountMult);
        const absPlans = planOverridesFromDraft(planOverrides);
        const hasAbs = Object.keys(absPlans).length > 0;
        if (mult == null && !hasAbs && hourlyEnabled === 'inherit' && !notes.trim()) {
          setError(
            'Set a sell multiplier and/or absolute plan prices (or notes / hourly), then save.'
          );
          setSaving(false);
          return;
        }
        const saved = await saveAccountVmPricingOverride(provider, scopeType, selected.id, {
          hourlyEnabled: hourlyEnabled === 'inherit' ? null : hourlyEnabled === 'on',
          categories:
            mult != null
              ? {
                  linux: { multiplier: mult },
                  windows: { multiplier: mult },
                  gpu: { multiplier: mult },
                }
              : {
                  // Clear category multipliers → inherit global; keep absolute plan overrides.
                  linux: { multiplier: null },
                  windows: { multiplier: null },
                  gpu: { multiplier: null },
                },
          planOverrides: absPlans,
          notes: notes.trim() || null,
        });
        applyOverrideToForm(saved);
        setFlash(
          mult != null
            ? `Saved ${mult}× sell multiplier for ${selected.label}.`
            : `Saved plan overrides for ${selected.label} (inherits global multiplier).`
        );
      } else {
        const mult = parseMultiplier(dedicatedMult);
        const absPlans = dedicatedOverridesFromDraft(dedicatedPlanOverrides);
        const hasAbs = Object.keys(absPlans).length > 0;
        if (mult == null && !hasAbs && !notes.trim()) {
          setError('Set a sell multiplier and/or absolute plan prices, then save.');
          setSaving(false);
          return;
        }
        const saved = await saveAccountVmPricingOverride(provider, scopeType, selected.id, {
          categories:
            mult != null
              ? { default: { multiplier: mult } }
              : { default: { multiplier: null } },
          dedicatedPlanOverrides: absPlans,
          notes: notes.trim() || null,
        });
        applyOverrideToForm(saved);
        setFlash(
          mult != null
            ? `Saved ${mult}× sell multiplier for ${selected.label}.`
            : `Saved plan overrides for ${selected.label} (inherits global multiplier).`
        );
      }
      await refreshOverridesList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save override.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await deleteAccountVmPricingOverride(provider, scopeType, selected.id);
      applyOverrideToForm(null);
      setFlash('Override removed — account inherits global pricing.');
      await refreshOverridesList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reset override.');
    } finally {
      setSaving(false);
    }
  }

  const filteredExisting = useMemo(
    () => existingOverrides.filter((o) => o.scopeType === scopeType),
    [existingOverrides, scopeType]
  );

  const effectiveWebyneMult =
    parseMultiplier(accountMult) ?? getGlobalSellMultiplier(globalWebyne);
  const effectiveDedicatedMult =
    parseMultiplier(dedicatedMult) ?? globalDedicatedMult;

  function formatMoney(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return '—';
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 p-6 lg:p-8">
      <div>
        <Link
          href="/super-admin-console/external-vm-pricing"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-4 w-4" /> External VM Pricing
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Account pricing overrides</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Each organization or tenant gets its own sell multiplier. Sell price = template base ×
          this account&apos;s multiplier.
        </p>
      </div>

      {flash ? <p className="text-sm text-green-700">{flash}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['webyne', 'Webyne'],
            ['dedicated', 'Dedicated Server'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setProvider(id);
              setSelected(null);
              applyOverrideToForm(null);
            }}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
              provider === id
                ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            {(
              [
                ['organization', 'Organization'],
                ['tenant', 'Tenant'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setScopeType(id);
                  setSelected(null);
                  applyOverrideToForm(null);
                  setQuery('');
                }}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                  scopeType === id
                    ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadAccounts(scopeType, query);
              }}
              placeholder={`Search ${scopeType}…`}
              className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadAccounts(scopeType, query)}
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>

          <div className="max-h-[360px] space-y-1 overflow-y-auto">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => void selectAccount(account)}
                className={`w-full rounded-lg px-2.5 py-2 text-left text-sm ${
                  selected?.id === account.id
                    ? 'bg-red-50 text-[#B91C1C]'
                    : 'hover:bg-gray-50 text-gray-800'
                }`}
              >
                <p className="truncate font-medium">{account.label}</p>
                {account.secondary ? (
                  <p className="truncate text-xs text-gray-500">{account.secondary}</p>
                ) : null}
              </button>
            ))}
            {!searching && accounts.length === 0 ? (
              <p className="px-1 text-xs text-gray-500">No accounts found.</p>
            ) : null}
          </div>

          {filteredExisting.length > 0 ? (
            <div className="border-t border-gray-100 pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Existing overrides
              </p>
              <div className="space-y-1">
                {filteredExisting.map((o) => {
                  const id = o.scopeType === 'organization' ? o.orgId : o.tenantId;
                  return (
                    <button
                      key={o._id}
                      type="button"
                      onClick={() => {
                        if (!id) return;
                        void selectAccount({
                          id,
                          label: o.accountLabel || id,
                        });
                      }}
                      className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {o.accountLabel || id}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
            </div>
          ) : !selected ? (
            <p className="py-12 text-center text-sm text-gray-500">
              Select an organization or tenant to edit custom pricing.
            </p>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selected.label}</h2>
                <p className="text-xs text-gray-500">
                  {scopeType} · {provider}
                  {(() => {
                    const mult =
                      provider === 'webyne'
                        ? parseMultiplier(accountMult)
                        : parseMultiplier(dedicatedMult);
                    if (mult != null) return ` · ${mult}× custom sell multiplier`;
                    return ' · no custom multiplier yet (using global)';
                  })()}
                </p>
              </div>

              {provider === 'webyne' ? (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Account sell multiplier
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-600">
                      Optional. Leave blank to inherit the global multiplier; set a value to apply
                      a custom × to Linux, Windows, and GPU. Currently{' '}
                      <span className="font-semibold text-[#B91C1C]">
                        {parseMultiplier(accountMult) != null
                          ? `${parseMultiplier(accountMult)}×`
                          : 'not set (using global)'}
                      </span>
                      .
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {MULTIPLIER_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAccountMult(String(preset))}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                            Number(accountMult) === preset
                              ? 'border-[#B91C1C] bg-white text-[#B91C1C]'
                              : 'border-amber-200 bg-white/80 text-gray-700 hover:bg-white'
                          }`}
                        >
                          {preset}×
                        </button>
                      ))}
                      <input
                        type="number"
                        min={0.01}
                        max={1000}
                        step="0.01"
                        value={accountMult}
                        onChange={(e) => setAccountMult(e.target.value)}
                        placeholder="e.g. 2"
                        className="w-24 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm"
                        aria-label="Account sell multiplier"
                      />
                    </div>
                  </div>

                  <label className="block text-xs font-medium text-gray-600">
                    Hourly billing
                    <select
                      value={hourlyEnabled}
                      onChange={(e) =>
                        setHourlyEnabled(e.target.value as 'inherit' | 'on' | 'off')
                      }
                      className="mt-1 w-full max-w-xs rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      <option value="inherit">Inherit global</option>
                      <option value="on">Force ON</option>
                      <option value="off">Force OFF</option>
                    </select>
                  </label>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Plans — base, current sell ({effectiveWebyneMult}×), optional absolute override
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                            <th className="px-3 py-2">Plan</th>
                            <th className="px-3 py-2">Hourly</th>
                            <th className="px-3 py-2">Monthly</th>
                            <th className="px-3 py-2">Quarterly</th>
                            <th className="px-3 py-2">Yearly</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catalogPlans.map((plan) => {
                            const row = planOverrides[plan._id] || {};
                            const setPeriod = (
                              period: keyof PlanOverrideDraft,
                              value: string
                            ) => {
                              if (!isDecimalDraft(value)) return;
                              setPlanOverrides((prev) => {
                                const next = { ...(prev[plan._id] || {}) };
                                if (!value.trim()) delete next[period];
                                else next[period] = value;
                                const copy = { ...prev };
                                if (Object.keys(next).length === 0) delete copy[plan._id];
                                else copy[plan._id] = next;
                                return copy;
                              });
                            };
                            return (
                              <tr key={plan._id} className="border-b border-gray-50 align-top">
                                <td className="px-3 py-2">
                                  <p className="font-medium text-gray-900">{plan.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {plan.vcpu}vCPU · {plan.ramGb}GB · {plan.ssdGb}GB
                                  </p>
                                </td>
                                {(['hourly', 'monthly', 'quarterly', 'yearly'] as const).map(
                                  (period) => {
                                    const base = plan[period];
                                    const sell = sellPriceForPeriod(
                                      plan,
                                      period as BillingPeriod,
                                      effectiveWebyneMult
                                    );
                                    return (
                                      <td key={period} className="px-3 py-2">
                                        <p className="text-[11px] text-gray-500">
                                          Base {formatMoney(base)}
                                        </p>
                                        <p className="mb-1 text-[11px] font-medium text-gray-800">
                                          Sell {formatMoney(sell)}
                                        </p>
                                        <input
                                          inputMode="decimal"
                                          value={row[period] ?? ''}
                                          onChange={(e) => setPeriod(period, e.target.value)}
                                          placeholder={
                                            sell != null ? String(sell) : '—'
                                          }
                                          className="w-24 rounded border border-gray-200 px-2 py-1 text-xs"
                                          title="Leave blank to use sell (base × multiplier). Enter ₹ to force absolute."
                                        />
                                      </td>
                                    );
                                  }
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Override input is optional. Blank = use sell price above. Enter a ₹ amount to
                      lock that plan/period for this account only.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Account sell multiplier
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-600">
                      Optional. Leave blank to inherit global. Sell = base monthly/setup ×
                      multiplier. Currently{' '}
                      <span className="font-semibold text-[#B91C1C]">
                        {parseMultiplier(dedicatedMult) != null
                          ? `${parseMultiplier(dedicatedMult)}×`
                          : 'not set (using global)'}
                      </span>
                      .
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {MULTIPLIER_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setDedicatedMult(String(preset))}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                            Number(dedicatedMult) === preset
                              ? 'border-[#B91C1C] bg-white text-[#B91C1C]'
                              : 'border-amber-200 bg-white/80 text-gray-700 hover:bg-white'
                          }`}
                        >
                          {preset}×
                        </button>
                      ))}
                      <input
                        type="number"
                        min={0.01}
                        max={1000}
                        step="0.01"
                        value={dedicatedMult}
                        onChange={(e) => setDedicatedMult(e.target.value)}
                        placeholder="e.g. 2"
                        className="w-24 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm"
                        aria-label="Account sell multiplier"
                      />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Plans — base, current sell ({effectiveDedicatedMult}×), optional absolute
                      override
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                            <th className="px-3 py-2">Plan</th>
                            <th className="px-3 py-2">Monthly</th>
                            <th className="px-3 py-2">Setup fee</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dedicatedPlans.map((plan) => {
                            const row = dedicatedPlanOverrides[plan._id] || {};
                            const sellMonthly = dedicatedPlanSellMonthly(
                              plan,
                              effectiveDedicatedMult
                            );
                            const sellSetup = dedicatedPlanSellSetup(
                              plan,
                              effectiveDedicatedMult
                            );
                            return (
                              <tr key={plan._id} className="border-b border-gray-50 align-top">
                                <td className="px-3 py-2 font-medium text-gray-900">
                                  {plan.name}
                                  <p className="text-xs font-normal text-gray-500">
                                    {plan.cpu} · {plan.ram} · {plan.disk}
                                  </p>
                                </td>
                                <td className="px-3 py-2">
                                  <p className="text-[11px] text-gray-500">
                                    Base {formatMoney(plan.monthlyPrice)}
                                  </p>
                                  <p className="mb-1 text-[11px] font-medium text-gray-800">
                                    Sell {formatMoney(sellMonthly)}
                                  </p>
                                  <input
                                    inputMode="decimal"
                                    value={row.monthlyPrice ?? ''}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (!isDecimalDraft(value)) return;
                                      setDedicatedPlanOverrides((prev) => {
                                        const next = { ...(prev[plan._id] || {}) };
                                        if (!value.trim()) delete next.monthlyPrice;
                                        else next.monthlyPrice = value;
                                        const copy = { ...prev };
                                        if (Object.keys(next).length === 0) delete copy[plan._id];
                                        else copy[plan._id] = next;
                                        return copy;
                                      });
                                    }}
                                    placeholder={
                                      sellMonthly != null ? String(sellMonthly) : '—'
                                    }
                                    className="w-28 rounded border border-gray-200 px-2 py-1 text-xs"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <p className="text-[11px] text-gray-500">
                                    Base {formatMoney(plan.setupFee)}
                                  </p>
                                  <p className="mb-1 text-[11px] font-medium text-gray-800">
                                    Sell {formatMoney(sellSetup)}
                                  </p>
                                  <input
                                    inputMode="decimal"
                                    value={row.setupFee ?? ''}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (!isDecimalDraft(value)) return;
                                      setDedicatedPlanOverrides((prev) => {
                                        const next = { ...(prev[plan._id] || {}) };
                                        if (!value.trim()) delete next.setupFee;
                                        else next.setupFee = value;
                                        const copy = { ...prev };
                                        if (Object.keys(next).length === 0) delete copy[plan._id];
                                        else copy[plan._id] = next;
                                        return copy;
                                      });
                                    }}
                                    placeholder={
                                      sellSetup != null ? String(sellSetup) : '—'
                                    }
                                    className="w-28 rounded border border-gray-200 px-2 py-1 text-xs"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              <label className="block text-xs font-medium text-gray-600">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional deal notes"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save override'}
                </button>
                <button
                  type="button"
                  disabled={saving || !override}
                  onClick={() => void handleReset()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Reset to global
                </button>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              {flash ? <p className="text-sm text-green-700">{flash}</p> : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
