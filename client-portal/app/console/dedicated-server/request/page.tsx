'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  RefreshCw,
  Search,
  Server,
  X,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { useDedicatedServerPortal } from '@/context/DedicatedServerPortalContext';
import { type IDedicatedPlan } from '@/lib/dedicatedServerApi';
import { dedicatedPlanCheckoutTotals } from '@/lib/dedicatedServerSellPrice';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { ProjectSelect } from '@/components/console/ProjectSelect';

function formatInr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function SpecPill({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 text-xs font-medium leading-snug text-gray-800">{value}</p>
    </div>
  );
}

export default function DedicatedRequestPage() {
  const router = useRouter();
  const { api, routes, isReady } = useDedicatedServerPortal();
  const projectPortal = routes.hub === '/console' ? 'org' : 'tenant';
  const [plans, setPlans] = useState<IDedicatedPlan[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IDedicatedPlan | null>(null);
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const planList = await api.fetchPlans();
      setPlans(planList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load plans.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isReady) void load();
  }, [load, isReady]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) =>
      [p.name, p.cpu, p.ram, p.disk, ...(p.features ?? [])].join(' ').toLowerCase().includes(q)
    );
  }, [plans, search]);

  function openPlan(plan: IDedicatedPlan) {
    setSelected(plan);
    setNotes('');
    setProjectId('');
    setError(null);
  }

  function closeDrawer() {
    setSelected(null);
    setError(null);
  }

  const checkout = selected ? dedicatedPlanCheckoutTotals(selected, 1) : null;
  const chargeTotal = checkout?.total ?? 0;
  const sellSetup = checkout?.setup ?? null;

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitRequest({
        planId: selected._id,
        notes: notes.trim() || undefined,
        ...(projectId ? { projectId } : {}),
      });
      router.push(routes.myServers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-screen-xl pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-[#B91C1C]">
            <Server className="h-3.5 w-3.5" />
            Bare-metal infrastructure
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Request Dedicated Server</h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            Select a hardware plan below. First month and any one-time setup fee are charged from your
            wallet when you submit.
          </p>
        </div>
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{filtered.length}</span> plans available
        </p>
      </div>

      {/* Search */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by CPU, RAM, storage…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-red-100"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && !selected ? (
        <div className="mt-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : null}

      {/* Plan grid */}
      {loading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-9 w-9 animate-spin text-[#B91C1C]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
          <Server className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">No plans available yet</p>
          <p className="mt-1 text-xs text-gray-400">Check back soon or contact your administrator.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((plan) => {
            const monthly = plan.monthlyPrice;
            const setup = plan.setupFee;
            const isSelected = selected?._id === plan._id;

            return (
              <article
                key={plan._id}
                className={`group flex flex-col rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
                  isSelected
                    ? 'border-[#B91C1C] ring-2 ring-red-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-sm font-semibold leading-snug text-gray-900 line-clamp-2">
                    {plan.name}
                  </h2>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <SpecPill icon={Cpu} label="CPU" value={plan.cpu} />
                    <SpecPill icon={MemoryStick} label="RAM" value={plan.ram} />
                    <SpecPill icon={HardDrive} label="Storage" value={plan.disk} />
                  </div>

                  {plan.features?.length ? (
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {plan.features.slice(0, 4).map((f) => (
                        <li
                          key={f}
                          className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] text-gray-600"
                        >
                          {f}
                        </li>
                      ))}
                      {plan.features.length > 4 ? (
                        <li className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] text-gray-500">
                          +{plan.features.length - 4} more
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>

                <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Starting from
                      </p>
                      <p className="text-xl font-bold text-gray-900">
                        {formatInr(monthly)}
                        <span className="text-sm font-normal text-gray-500"> /mo</span>
                      </p>
                      {setup != null && setup > 0 ? (
                        <p className="mt-0.5 text-xs text-gray-500">
                          + {formatInr(setup)} setup fee
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[10px] text-gray-400">+ 18% GST at checkout</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openPlan(plan)}
                      className="shrink-0 rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a01717] active:scale-[0.98]"
                    >
                      Request
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Confirm drawer */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[2px]">
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="border-b bg-gradient-to-r from-red-50 to-white px-6 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
                    Confirm request
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-gray-900">{selected.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-lg p-2 text-gray-500 transition hover:bg-white hover:text-gray-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <SpecPill icon={Cpu} label="CPU" value={selected.cpu} />
                <SpecPill icon={MemoryStick} label="RAM" value={selected.ram} />
                <SpecPill icon={HardDrive} label="Storage" value={selected.disk} />
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {selected.features?.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Included
                  </p>
                  <ul className="space-y-2">
                    {selected.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Billing summary
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>First month</span>
                    <span className="font-mono font-medium text-gray-900">
                      {formatInr(checkout?.monthly)}
                    </span>
                  </div>
                  {sellSetup != null && sellSetup > 0 ? (
                    <div className="flex justify-between text-gray-600">
                      <span>Setup fee</span>
                      <span className="font-mono font-medium text-gray-900">
                        {formatInr(sellSetup)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-gray-100 pt-2 text-gray-600">
                    <span>Subtotal</span>
                    <span className="font-mono font-medium text-gray-900">
                      {formatInr(checkout?.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>GST (18%)</span>
                    <span className="font-mono font-medium text-gray-900">
                      {formatInr(checkout?.tax)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-semibold text-gray-900">
                    <span>Total charged now</span>
                    <span className="font-mono text-[#B91C1C]">{formatInr(chargeTotal)}</span>
                  </div>
                </div>
              </div>

              <ProjectSelect
                serviceKey="dedicated-server"
                value={projectId}
                onChange={setProjectId}
                disabled={submitting}
                portal={projectPortal}
              />

              <div>
                <label className="text-sm font-medium text-gray-800">
                  Notes <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-red-100"
                  placeholder="Preferred OS, region, or other requirements…"
                />
              </div>

              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="border-t bg-gray-50 px-6 py-4">
              <button
                type="button"
                disabled={submitting || chargeTotal <= 0}
                onClick={() => void handleSubmit()}
                className="w-full rounded-xl bg-[#B91C1C] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a01717] disabled:opacity-50"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </span>
                ) : (
                  `Confirm & pay ${formatInr(chargeTotal)}`
                )}
              </button>
              <p className="mt-2 text-center text-xs text-gray-400">
                Charged from your wallet · Super-admin will attach your server
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
