'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  createVmCatalogPlan,
  deleteVmCatalogPlan,
  fetchVmCatalogPlans,
  seedVmCatalogPlans,
  updateVmCatalogPlan,
  type IVmCatalogPlan,
} from '@/lib/vmCatalogApi';
import {
  getExternalVmPricing,
  saveExternalVmPricing,
  type ExternalVmPricingConfig,
} from '@/lib/externalVmPricingApi';
import {
  applySellMultiplier,
  getGlobalSellMultiplier,
} from '@/lib/vmCatalogSellPrice';
import { ErrorState } from '@/components/dashboard/ErrorState';

const emptyForm = {
  sno: '',
  name: '',
  vcpu: '',
  ramGb: '',
  ssdGb: '',
  hourly: '',
  monthly: '',
  quarterly: '',
  yearly: '',
  isActive: true,
};

type PlanForm = typeof emptyForm;

const MULTIPLIER_PRESETS = [1, 1.5, 2, 2.5, 3, 4, 5];

function parseOptionalNumber(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function planToForm(plan: IVmCatalogPlan): PlanForm {
  return {
    sno: plan.sno != null ? String(plan.sno) : '',
    name: plan.name,
    vcpu: String(plan.vcpu),
    ramGb: String(plan.ramGb),
    ssdGb: String(plan.ssdGb),
    hourly: plan.hourly != null ? String(plan.hourly) : '',
    monthly: plan.monthly != null ? String(plan.monthly) : '',
    quarterly: plan.quarterly != null ? String(plan.quarterly) : '',
    yearly: plan.yearly != null ? String(plan.yearly) : '',
    isActive: plan.isActive,
  };
}

function fmtInr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export default function WebynePricingPage() {
  const [plans, setPlans] = useState<IVmCatalogPlan[]>([]);
  const [pricingConfig, setPricingConfig] = useState<ExternalVmPricingConfig | null>(null);
  const [multiplierInput, setMultiplierInput] = useState('1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingMultiplier, setSavingMultiplier] = useState(false);
  const [savingHourlyToggle, setSavingHourlyToggle] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const sellMultiplier = getGlobalSellMultiplier(pricingConfig);
  const hourlyEnabled = Boolean(pricingConfig?.hourlyEnabled);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planList, pricing] = await Promise.all([
        fetchVmCatalogPlans(),
        getExternalVmPricing('webyne'),
      ]);
      setPlans(planList);
      setPricingConfig(pricing);
      setMultiplierInput(String(getGlobalSellMultiplier(pricing)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(plan: IVmCatalogPlan) {
    setEditingId(plan._id);
    setForm(planToForm(plan));
    setFlash(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSaveMultiplier() {
    const m = Number(multiplierInput);
    if (!Number.isFinite(m) || m <= 0 || m > 1000) {
      setError('Multiplier must be a number between 0.01 and 1000.');
      return;
    }
    setSavingMultiplier(true);
    setError(null);
    setFlash(null);
    try {
      const existing = pricingConfig ?? (await getExternalVmPricing('webyne'));
      const saved = await saveExternalVmPricing(
        'webyne',
        {
          linux: { multiplier: m, plans: existing.categories.linux?.plans ?? {} },
          windows: { multiplier: m, plans: existing.categories.windows?.plans ?? {} },
          gpu: { multiplier: m, plans: existing.categories.gpu?.plans ?? {} },
        },
        { hourlyEnabled: Boolean(existing.hourlyEnabled) }
      );
      setPricingConfig(saved);
      setMultiplierInput(String(m));
      setFlash(
        m === 1
          ? 'Global sell multiplier set to 1× (base prices).'
          : `Global sell multiplier set to ${m}× — Create VM charges base × ${m}.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save multiplier.');
    } finally {
      setSavingMultiplier(false);
    }
  }

  async function handleToggleHourly(next: boolean) {
    setSavingHourlyToggle(true);
    setError(null);
    setFlash(null);
    try {
      const existing = pricingConfig ?? (await getExternalVmPricing('webyne'));
      const m = getGlobalSellMultiplier(existing);
      const saved = await saveExternalVmPricing(
        'webyne',
        {
          linux: { multiplier: m, plans: existing.categories.linux?.plans ?? {} },
          windows: { multiplier: m, plans: existing.categories.windows?.plans ?? {} },
          gpu: { multiplier: m, plans: existing.categories.gpu?.plans ?? {} },
        },
        { hourlyEnabled: next }
      );
      setPricingConfig(saved);
      setFlash(
        next
          ? 'Hourly pricing is ON — shown on admin and tenant Create VM.'
          : 'Hourly pricing is OFF — admin and tenant see monthly, quarterly, yearly only.'
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update hourly toggle.');
    } finally {
      setSavingHourlyToggle(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFlash(null);

    const payload = {
      sno: form.sno.trim() ? Number(form.sno) : undefined,
      name: form.name.trim(),
      vcpu: Number(form.vcpu),
      ramGb: Number(form.ramGb),
      ssdGb: Number(form.ssdGb),
      hourly: parseOptionalNumber(form.hourly),
      monthly: parseOptionalNumber(form.monthly),
      quarterly: parseOptionalNumber(form.quarterly),
      yearly: parseOptionalNumber(form.yearly),
      currency: 'INR' as const,
      isActive: form.isActive,
    };

    try {
      if (editingId) {
        await updateVmCatalogPlan(editingId, payload);
        setFlash('Template base prices updated.');
        cancelEdit();
      } else {
        await createVmCatalogPlan({
          ...payload,
          sortOrder: plans.length,
        });
        setForm(emptyForm);
        setFlash('Plan added.');
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    setFlash(null);
    try {
      const result = await seedVmCatalogPlans();
      setFlash(
        result.inserted > 0
          ? `Seeded ${result.inserted} templates from the Webyne sheet.`
          : `Already has ${result.total} plans — seed skipped.`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Seed failed.');
    } finally {
      setSeeding(false);
    }
  }

  async function toggleActive(plan: IVmCatalogPlan) {
    try {
      await updateVmCatalogPlan(plan._id, { isActive: !plan.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return;
    try {
      if (editingId === id) cancelEdit();
      await deleteVmCatalogPlan(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 p-6 lg:p-8">
      <div>
        <Link
          href="/super-admin-console/external-vm-pricing"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-4 w-4" />
          External VM Pricing
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Webyne Templates</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Base prices live on each template. Global multiplier (2×, 3×, …) sets sell price for Create
              VM.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSeed()}
            disabled={seeding}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {seeding ? 'Seeding…' : 'Seed sheet defaults'}
          </button>
        </div>
      </div>

      {flash ? <p className="text-sm text-green-700">{flash}</p> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Global sell multiplier</h2>
            <p className="mt-0.5 text-xs text-gray-600">
              Sell price = template base × multiplier. Applies to all templates on Create VM.
              Currently{' '}
              <span className="font-semibold text-[#B91C1C]">{sellMultiplier}×</span>.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {MULTIPLIER_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setMultiplierInput(String(preset))}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                Number(multiplierInput) === preset
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
            value={multiplierInput}
            onChange={(e) => setMultiplierInput(e.target.value)}
            className="w-24 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm"
            aria-label="Custom multiplier"
          />
          <button
            type="button"
            disabled={savingMultiplier}
            onClick={() => void handleSaveMultiplier()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {savingMultiplier ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save multiplier
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Hourly pricing</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              When on, hourly appears on admin and tenant Create VM. When off, only monthly,
              quarterly, and yearly are offered.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hourlyEnabled}
            disabled={savingHourlyToggle || loading}
            onClick={() => void handleToggleHourly(!hourlyEnabled)}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
              hourlyEnabled ? 'bg-[#B91C1C]' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                hourlyEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
            <span className="sr-only">
              {hourlyEnabled ? 'Disable hourly pricing' : 'Enable hourly pricing'}
            </span>
          </button>
        </div>
        <p className="mt-2 text-xs font-medium text-gray-700">
          {savingHourlyToggle ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          ) : hourlyEnabled ? (
            <span className="text-green-700">Hourly is ON</span>
          ) : (
            <span className="text-gray-500">Hourly is OFF</span>
          )}
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-sm font-semibold text-gray-900">
            {editingId ? 'Edit template base prices' : 'Add template'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            These are base amounts. Create VM shows and charges base × {sellMultiplier}.
          </p>
        </div>
        <input
          placeholder="S.No"
          value={form.sno}
          onChange={(e) => setForm((f) => ({ ...f, sno: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Template name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          required
          type="number"
          min={1}
          placeholder="vCPU"
          value={form.vcpu}
          onChange={(e) => setForm((f) => ({ ...f, vcpu: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          required
          type="number"
          min={1}
          placeholder="RAM (GB)"
          value={form.ramGb}
          onChange={(e) => setForm((f) => ({ ...f, ramGb: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          required
          type="number"
          min={1}
          placeholder="SSD (GB)"
          value={form.ssdGb}
          onChange={(e) => setForm((f) => ({ ...f, ssdGb: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Hourly (base)"
          value={form.hourly}
          onChange={(e) => setForm((f) => ({ ...f, hourly: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Monthly (base)"
          value={form.monthly}
          onChange={(e) => setForm((f) => ({ ...f, monthly: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Quarterly (base)"
          value={form.quarterly}
          onChange={(e) => setForm((f) => ({ ...f, quarterly: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Yearly (base)"
          value={form.yearly}
          onChange={(e) => setForm((f) => ({ ...f, yearly: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editingId ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {editingId ? 'Save base prices' : 'Add template'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
          </div>
        ) : plans.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">
            No templates yet. Use “Seed sheet defaults” or add one above.
          </p>
        ) : (
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th rowSpan={2} className="border-r border-gray-100 px-3 py-2.5 text-left align-bottom">
                  #
                </th>
                <th rowSpan={2} className="border-r border-gray-100 px-3 py-2.5 text-left align-bottom">
                  Template
                </th>
                <th
                  colSpan={3}
                  className="border-b border-r border-gray-100 px-3 py-2 text-center text-gray-600"
                >
                  Specs
                </th>
                <th
                  colSpan={4}
                  className="border-b border-r border-gray-100 bg-slate-50 px-3 py-2 text-center text-slate-600"
                >
                  Base (₹)
                </th>
                <th
                  colSpan={4}
                  className="border-b border-r border-gray-100 bg-red-50/70 px-3 py-2 text-center text-[#B91C1C]"
                >
                  Sell {sellMultiplier}× (₹)
                </th>
                <th rowSpan={2} className="border-r border-gray-100 px-3 py-2.5 text-left align-bottom">
                  Status
                </th>
                <th rowSpan={2} className="px-3 py-2.5 text-right align-bottom">
                  Actions
                </th>
              </tr>
              <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="border-r border-gray-100 px-2 py-2 text-right">vCPU</th>
                <th className="border-r border-gray-100 px-2 py-2 text-right">RAM</th>
                <th className="border-r border-gray-100 px-2 py-2 text-right">SSD</th>
                <th className="border-r border-gray-100 bg-slate-50 px-2 py-2 text-right">Hr</th>
                <th className="border-r border-gray-100 bg-slate-50 px-2 py-2 text-right">Mon</th>
                <th className="border-r border-gray-100 bg-slate-50 px-2 py-2 text-right">QTr</th>
                <th className="border-r border-gray-100 bg-slate-50 px-2 py-2 text-right">Year</th>
                <th className="border-r border-gray-100 bg-red-50/70 px-2 py-2 text-right">Hr</th>
                <th className="border-r border-gray-100 bg-red-50/70 px-2 py-2 text-right">Mon</th>
                <th className="border-r border-gray-100 bg-red-50/70 px-2 py-2 text-right">QTr</th>
                <th className="border-r border-gray-100 bg-red-50/70 px-2 py-2 text-right">Year</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr
                  key={p._id}
                  className={`border-b border-gray-100 ${
                    editingId === p._id ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                  }`}
                >
                  <td className="border-r border-gray-50 px-3 py-2.5 text-gray-500">{p.sno ?? '—'}</td>
                  <td className="border-r border-gray-50 px-3 py-2.5 font-medium text-gray-900">
                    {p.name}
                  </td>
                  <td className="border-r border-gray-50 px-2 py-2.5 text-right tabular-nums text-gray-700">
                    {p.vcpu}
                  </td>
                  <td className="border-r border-gray-50 px-2 py-2.5 text-right tabular-nums text-gray-700">
                    {p.ramGb}
                  </td>
                  <td className="border-r border-gray-50 px-2 py-2.5 text-right tabular-nums text-gray-700">
                    {p.ssdGb}
                  </td>
                  <td className="border-r border-gray-50 bg-slate-50/40 px-2 py-2.5 text-right tabular-nums text-gray-600">
                    {fmtInr(p.hourly)}
                  </td>
                  <td className="border-r border-gray-50 bg-slate-50/40 px-2 py-2.5 text-right tabular-nums text-gray-600">
                    {fmtInr(p.monthly)}
                  </td>
                  <td className="border-r border-gray-50 bg-slate-50/40 px-2 py-2.5 text-right tabular-nums text-gray-600">
                    {fmtInr(p.quarterly)}
                  </td>
                  <td className="border-r border-gray-50 bg-slate-50/40 px-2 py-2.5 text-right tabular-nums text-gray-600">
                    {fmtInr(p.yearly)}
                  </td>
                  <td className="border-r border-gray-50 bg-red-50/30 px-2 py-2.5 text-right tabular-nums font-medium text-gray-900">
                    {fmtInr(applySellMultiplier(p.hourly, sellMultiplier))}
                  </td>
                  <td className="border-r border-gray-50 bg-red-50/30 px-2 py-2.5 text-right tabular-nums font-medium text-gray-900">
                    {fmtInr(applySellMultiplier(p.monthly, sellMultiplier))}
                  </td>
                  <td className="border-r border-gray-50 bg-red-50/30 px-2 py-2.5 text-right tabular-nums font-medium text-gray-900">
                    {fmtInr(applySellMultiplier(p.quarterly, sellMultiplier))}
                  </td>
                  <td className="border-r border-gray-50 bg-red-50/30 px-2 py-2.5 text-right tabular-nums font-medium text-gray-900">
                    {fmtInr(applySellMultiplier(p.yearly, sellMultiplier))}
                  </td>
                  <td className="border-r border-gray-50 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => void toggleActive(p)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.isActive
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {p.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#B91C1C]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(p._id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
