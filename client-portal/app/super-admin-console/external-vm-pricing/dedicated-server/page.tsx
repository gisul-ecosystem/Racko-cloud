'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  createDedicatedPlan,
  deleteDedicatedPlan,
  fetchDedicatedPlans,
  fetchDedicatedPricingSettings,
  saveDedicatedPricingSettings,
  seedDedicatedPlans,
  updateDedicatedPlan,
  type IDedicatedPlan,
} from '@/lib/dedicatedServerApi';
import {
  dedicatedPlanSellMonthly,
  dedicatedPlanSellSetup,
} from '@/lib/dedicatedServerSellPrice';
import { ErrorState } from '@/components/dashboard/ErrorState';

const MULTIPLIER_PRESETS = [1, 1.5, 2, 2.5, 3, 4, 5];

const emptyForm = {
  name: '',
  description: '',
  cpu: '',
  ram: '',
  disk: '',
  location: '',
  features: '',
  monthlyPrice: '',
  setupFee: '',
  isActive: true,
};

type PlanForm = typeof emptyForm;

function fmtInr(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function planToForm(plan: IDedicatedPlan): PlanForm {
  return {
    name: plan.name,
    description: plan.description ?? '',
    cpu: plan.cpu,
    ram: plan.ram,
    disk: plan.disk,
    location: plan.location ?? '',
    features: (plan.features ?? []).join('\n'),
    monthlyPrice: String(plan.monthlyPrice),
    setupFee: plan.setupFee != null ? String(plan.setupFee) : '',
    isActive: plan.isActive,
  };
}

export default function DedicatedServerPricingPage() {
  const [plans, setPlans] = useState<IDedicatedPlan[]>([]);
  const [multiplier, setMultiplier] = useState('1');
  const [sellMultiplier, setSellMultiplier] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingMultiplier, setSavingMultiplier] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planList, pricing] = await Promise.all([
        fetchDedicatedPlans(),
        fetchDedicatedPricingSettings(),
      ]);
      setPlans(planList);
      setSellMultiplier(pricing.sellMultiplier);
      setMultiplier(String(pricing.sellMultiplier));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(plan: IDedicatedPlan) {
    setEditingId(plan._id);
    setForm(planToForm(plan));
    setFlash(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSaveMultiplier() {
    const m = Number(multiplier);
    if (!Number.isFinite(m) || m <= 0 || m > 1000) {
      setError('Multiplier must be between 0.01 and 1000.');
      return;
    }
    setSavingMultiplier(true);
    setError(null);
    setFlash(null);
    try {
      const saved = await saveDedicatedPricingSettings(m);
      setSellMultiplier(saved.sellMultiplier);
      setMultiplier(String(saved.sellMultiplier));
      setFlash(`Sell multiplier set to ${saved.sellMultiplier}×`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save multiplier.');
    } finally {
      setSavingMultiplier(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    setFlash(null);
    try {
      const result = await seedDedicatedPlans();
      setFlash(
        result.inserted > 0
          ? `Seeded ${result.inserted} dedicated server plans.`
          : `Already has ${result.total} plans — seed skipped.`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Seed failed.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFlash(null);

    const features = form.features
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const setupRaw = form.setupFee.trim();
    const setupFee = setupRaw === '' ? null : Number(setupRaw);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      cpu: form.cpu.trim(),
      ram: form.ram.trim(),
      disk: form.disk.trim(),
      location: form.location.trim() || undefined,
      features,
      monthlyPrice: Number(form.monthlyPrice),
      setupFee: Number.isFinite(setupFee as number) ? setupFee : null,
      currency: 'INR' as const,
      isActive: form.isActive,
    };

    try {
      if (editingId) {
        await updateDedicatedPlan(editingId, payload);
        setFlash('Plan updated.');
        cancelEdit();
      } else {
        await createDedicatedPlan({ ...payload, sortOrder: plans.length });
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

  async function toggleActive(plan: IDedicatedPlan) {
    try {
      await updateDedicatedPlan(plan._id, { isActive: !plan.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this plan?')) return;
    try {
      if (editingId === id) cancelEdit();
      await deleteDedicatedPlan(id);
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
            <h1 className="text-2xl font-bold text-gray-900">Dedicated Server Plans</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Bare-metal catalog for admins. Base prices × {sellMultiplier} sell multiplier.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSeed()}
            disabled={seeding}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {seeding ? 'Seeding…' : 'Seed provider catalog'}
          </button>
        </div>
      </div>

      {flash ? <p className="text-sm text-green-700">{flash}</p> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Global sell multiplier</h2>
        <p className="mt-0.5 text-xs text-gray-600">
          Admin sees and is charged base × multiplier (monthly + setup fee).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {MULTIPLIER_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setMultiplier(String(preset))}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                Number(multiplier) === preset
                  ? 'border-[#B91C1C] bg-white text-[#B91C1C]'
                  : 'border-amber-200 bg-white/80 text-gray-700'
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
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            className="w-24 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={savingMultiplier}
            onClick={() => void handleSaveMultiplier()}
            className="rounded-lg bg-[#B91C1C] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {savingMultiplier ? 'Saving…' : 'Save multiplier'}
          </button>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
      >
        <p className="text-sm font-semibold text-gray-900 sm:col-span-2 lg:col-span-3">
          {editingId ? 'Edit plan (base prices)' : 'Add plan'}
        </p>
        <input
          required
          placeholder="Plan name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          required
          placeholder="CPU"
          value={form.cpu}
          onChange={(e) => setForm((f) => ({ ...f, cpu: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="RAM"
          value={form.ram}
          onChange={(e) => setForm((f) => ({ ...f, ram: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Storage"
          value={form.disk}
          onChange={(e) => setForm((f) => ({ ...f, disk: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={0}
          placeholder="Monthly base (₹)"
          value={form.monthlyPrice}
          onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={0}
          placeholder="Setup fee base (₹)"
          value={form.setupFee}
          onChange={(e) => setForm((f) => ({ ...f, setupFee: e.target.value }))}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Features (one per line)"
          value={form.features}
          onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
          rows={3}
          className="rounded-lg border px-3 py-2 text-sm sm:col-span-2 lg:col-span-3"
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingId ? 'Save plan' : 'Add plan'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm"
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
            No plans yet. Click “Seed provider catalog”.
          </p>
        ) : (
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Specs</th>
                <th className="px-4 py-3 text-right">Base/mo</th>
                <th className="px-4 py-3 text-right">Base setup</th>
                <th className="px-4 py-3 text-right">Sell/mo ({sellMultiplier}×)</th>
                <th className="px-4 py-3 text-right">Sell setup</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr
                  key={p._id}
                  className={`border-b border-gray-50 ${editingId === p._id ? 'bg-red-50/40' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {p.cpu} · {p.ram} · {p.disk}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{fmtInr(p.monthlyPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{fmtInr(p.setupFee)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                    {fmtInr(dedicatedPlanSellMonthly(p, sellMultiplier))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                    {fmtInr(dedicatedPlanSellSetup(p, sellMultiplier))}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void toggleActive(p)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {p.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-3">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="text-xs font-semibold text-[#B91C1C]"
                      >
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
