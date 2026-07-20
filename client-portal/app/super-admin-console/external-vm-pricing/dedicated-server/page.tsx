'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  createDedicatedPlan,
  deleteDedicatedPlan,
  fetchDedicatedPlans,
  updateDedicatedPlan,
  type IDedicatedPlan,
} from '@/lib/dedicatedServerApi';
import { ErrorState } from '@/components/dashboard/ErrorState';

const emptyForm = {
  name: '',
  description: '',
  cpu: '',
  ram: '',
  disk: '',
  location: '',
  monthlyPrice: '',
  isActive: true,
};

export default function DedicatedServerPricingPage() {
  const [plans, setPlans] = useState<IDedicatedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await fetchDedicatedPlans());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createDedicatedPlan({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        cpu: form.cpu.trim(),
        ram: form.ram.trim(),
        disk: form.disk.trim(),
        location: form.location.trim() || undefined,
        monthlyPrice: Number(form.monthlyPrice),
        currency: 'INR',
        isActive: form.isActive,
        sortOrder: plans.length,
      });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed.');
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
      await deleteDedicatedPlan(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  return (
    <div className="mx-auto max-w-screen-xl p-6 lg:p-8">
      <Link
        href="/super-admin-console/external-vm-pricing"
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#B91C1C]"
      >
        <ArrowLeft className="h-4 w-4" />
        External VM Pricing
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Dedicated Server Pricing</h1>
      <p className="mt-1 text-sm text-gray-500">
        Define dedicated server plans and monthly pricing shown to admins.
      </p>

      {error && (
        <div className="mt-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="mt-6 grid gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
      >
        <input
          required
          placeholder="Plan name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="CPU (e.g. 8 cores)"
          value={form.cpu}
          onChange={(e) => setForm((f) => ({ ...f, cpu: e.target.value }))}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="RAM (e.g. 32 GB)"
          value={form.ram}
          onChange={(e) => setForm((f) => ({ ...f, ram: e.target.value }))}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Disk (e.g. 1 TB NVMe)"
          value={form.disk}
          onChange={(e) => setForm((f) => ({ ...f, disk: e.target.value }))}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          placeholder="Location"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          required
          type="number"
          min={0}
          step={1}
          placeholder="Monthly price (₹)"
          value={form.monthlyPrice}
          onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm sm:col-span-2"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add plan
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
          </div>
        ) : plans.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">No plans yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-5 py-3">Name</th>
                <th className="px-4 py-3">Specs</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p._id} className="border-b border-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {p.cpu} · {p.ram} · {p.disk}
                    {p.location ? ` · ${p.location}` : ''}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    ₹ {p.monthlyPrice.toLocaleString('en-IN')}/mo
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(p._id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
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
