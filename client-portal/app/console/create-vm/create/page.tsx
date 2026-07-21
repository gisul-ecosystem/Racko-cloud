'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShoppingCart, X } from 'lucide-react';
import Link from 'next/link';
import { ApiError } from '../../../../lib/apiClient';
import { useVmCatalogPortal } from '../../../../context/VmCatalogPortalContext';
import {
  type IVmCatalogPlan,
  type VmCatalogCategory,
} from '../../../../lib/vmCatalogApi';

const OS_OPTIONS: { id: VmCatalogCategory; label: string }[] = [
  { id: 'linux', label: 'Linux' },
  { id: 'windows', label: 'Windows' },
  { id: 'gpu', label: 'GPU' },
];

const BILLING_KEYS = ['hourly', 'monthly', 'quarterly', 'yearly'] as const;
type BillingKey = (typeof BILLING_KEYS)[number];

const BILLING_LABELS: Record<BillingKey, string> = {
  hourly: 'Hourly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

const GST_RATE = 0.18;

function inr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹ ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function priceForPeriod(
  plan: IVmCatalogPlan,
  period: BillingKey,
  category?: VmCatalogCategory
): number | null {
  if (category && plan.sellPricesByCategory?.[category]) {
    return plan.sellPricesByCategory[category][period];
  }
  return plan[period];
}

function availableBillings(plan: IVmCatalogPlan, category?: VmCatalogCategory): BillingKey[] {
  return BILLING_KEYS.filter((k) => {
    const price = priceForPeriod(plan, k, category);
    return price != null && Number(price) > 0;
  });
}

export default function CreateVmPage() {
  const { api, routes, isReady } = useVmCatalogPortal();
  const [plans, setPlans] = useState<IVmCatalogPlan[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<IVmCatalogPlan | null>(null);
  const [os, setOs] = useState<VmCatalogCategory>('linux');
  const [billing, setBilling] = useState<BillingKey>('monthly');
  const [quantity, setQuantity] = useState('1');
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await api.fetchPlans());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load plans.');
      setPlans([]);
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
      [p.name, String(p.vcpu), String(p.ramGb), String(p.ssdGb)]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [plans, search]);

  function openPlan(plan: IVmCatalogPlan) {
    const cycles = availableBillings(plan, 'linux');
    setSelected(plan);
    setOs('linux');
    setBilling(cycles.includes('monthly') ? 'monthly' : cycles[0] || 'monthly');
    setQuantity('1');
    setBuyError(null);
    setSubmittedRequestId(null);
  }

  function closeDrawer() {
    setSelected(null);
    setBuyError(null);
    setSubmittedRequestId(null);
  }

  useEffect(() => {
    if (!selected) return;
    const cycles = availableBillings(selected, os);
    if (!cycles.includes(billing)) {
      setBilling(cycles.includes('monthly') ? 'monthly' : cycles[0] || 'monthly');
    }
  }, [selected, os, billing]);

  const unitPrice = selected ? Number(priceForPeriod(selected, billing, os) ?? 0) : 0;
  const qty = Math.max(1, Number(quantity) || 1);
  const subtotal = unitPrice * qty;
  const tax = Math.round(subtotal * GST_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  async function onBuyNow() {
    if (!selected) return;
    const cycles = availableBillings(selected, os);
    if (!cycles.includes(billing) || unitPrice <= 0) {
      setBuyError('Select a valid billing cycle for this template.');
      return;
    }

    const osLabel = OS_OPTIONS.find((o) => o.id === os)?.label || os;

    setBuyLoading(true);
    setBuyError(null);
    setSubmittedRequestId(null);
    try {
      const request = await api.submitRequest({
        category: os,
        planId: selected._id,
        planName: selected.name,
        specs: {
          cpu: `${selected.vcpu} vCPU`,
          ram: `${selected.ramGb} GB`,
          disk: `${selected.ssdGb} GB SSD`,
        },
        billing,
        quantity: qty,
        template: {
          value: os,
          label: osLabel,
        },
        pricingSnapshot: {
          currency: selected.currency || 'INR',
          subtotal,
          tax,
          total,
          billingLabel: 'GST 18%',
        },
      });
      setSubmittedRequestId(request._id);
    } catch (err) {
      setBuyError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to submit request'
      );
    } finally {
      setBuyLoading(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-screen-xl space-y-5 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create VM</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Step 1 — choose a template. Step 2 — choose the OS and billing.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">
            No templates published yet. Ask a super-admin to add Webyne plans.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">vCPU</th>
                <th className="px-4 py-3">RAM</th>
                <th className="px-4 py-3">SSD</th>
                <th className="px-4 py-3">Hr</th>
                <th className="px-4 py-3">Mon</th>
                <th className="px-4 py-3">QTr</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, index) => (
                <tr key={p._id} className="border-b border-gray-50 hover:bg-gray-50/80">
                  <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3">{p.vcpu}</td>
                  <td className="px-4 py-3">{p.ramGb}</td>
                  <td className="px-4 py-3">{p.ssdGb}</td>
                  <td className="px-4 py-3 font-mono text-xs">{inr(priceForPeriod(p, 'hourly'))}</td>
                  <td className="px-4 py-3 font-mono text-xs">{inr(priceForPeriod(p, 'monthly'))}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {inr(priceForPeriod(p, 'quarterly'))}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{inr(priceForPeriod(p, 'yearly'))}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openPlan(p)}
                      className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Configure
                </p>
                <h2 className="text-lg font-semibold text-gray-900">{selected.name}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {selected.vcpu} vCPU · {selected.ramGb} GB RAM · {selected.ssdGb} GB SSD
                </p>
              </div>
              <button type="button" onClick={closeDrawer} className="rounded-md p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">1. Operating system</p>
                <div className="flex flex-wrap gap-2">
                  {OS_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOs(opt.id)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        os === opt.id
                          ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">2. Billing cycle</p>
                <div className="flex flex-wrap gap-2">
                  {availableBillings(selected, os).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setBilling(key)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        billing === key
                          ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {BILLING_LABELS[key]} · {inr(priceForPeriod(selected, key, os))}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-900">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-mono">{inr(subtotal)}</span>
                </div>
                <div className="mt-1 flex justify-between text-gray-600">
                  <span>GST 18%</span>
                  <span className="font-mono">{inr(tax)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                  <span>Total</span>
                  <span className="font-mono">{inr(total)}</span>
                </div>
              </div>

              {buyError ? <p className="text-sm text-red-600">{buyError}</p> : null}
              {submittedRequestId ? (
                <p className="text-sm text-green-700">
                  Request submitted. Track under{' '}
                  <Link href={routes.myVms} className="underline">
                    My VM
                  </Link>
                  .
                </p>
              ) : null}
            </div>

            <div className="border-t px-5 py-4">
              <button
                type="button"
                disabled={buyLoading || !!submittedRequestId || total <= 0}
                onClick={() => void onBuyNow()}
                className="w-full rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {buyLoading ? 'Submitting…' : `Buy Now · ${inr(total)}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
