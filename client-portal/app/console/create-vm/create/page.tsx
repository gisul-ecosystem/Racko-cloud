'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShoppingCart, X } from 'lucide-react';
import {
  getCart,
  getPricing,
  type CartDetails,
  type CatalogPlan,
  type CatalogType,
} from '../../../../lib/createVmCatalogApi';
import { submitCatalogVmRequest } from '../../../../lib/vmCatalogApi';
import { ApiError } from '../../../../lib/apiClient';
import Link from 'next/link';

const TABS: { id: CatalogType; label: string }[] = [
  { id: 'linux', label: 'Linux' },
  { id: 'windows', label: 'Windows' },
  { id: 'gpu', label: 'GPU' },
];

type StatusKind = '' | 'busy' | 'ok' | 'err';

function inr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹ ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 })}`;
}

function priceCell(value: string | null | undefined) {
  if (value == null || value === '') {
    return <span className="text-gray-300">—</span>;
  }
  return <span className="font-mono text-[0.88rem] whitespace-nowrap">{value}</span>;
}

export default function CreateVmPage() {
  const [activeType, setActiveType] = useState<CatalogType>('linux');
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Ready');
  const [statusKind, setStatusKind] = useState<StatusKind>('');
  const [loadingPlans, setLoadingPlans] = useState(false);

  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartDetails | null>(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [billing, setBilling] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [template, setTemplate] = useState('');
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);

  const setStatusMsg = useCallback((text: string, kind: StatusKind = '') => {
    setStatus(text);
    setStatusKind(kind);
  }, []);

  const loadPlans = useCallback(
    async (type: CatalogType) => {
      setActiveType(type);
      setLoadingPlans(true);
      setStatusMsg('Fetching live plans…', 'busy');
      setPlans([]);
      try {
        const data = await getPricing(type);
        setPlans(data.plans || []);
        setStatusMsg(`Live · ${(data.plans || []).length} plans`, 'ok');
      } catch (err) {
        setPlans([]);
        setStatusMsg(err instanceof Error ? err.message : 'Fetch failed', 'err');
      } finally {
        setLoadingPlans(false);
      }
    },
    [setStatusMsg]
  );

  useEffect(() => {
    void loadPlans('linux');
  }, [loadPlans]);

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) =>
      [p.plan, p.cpu, p.ram, p.disk]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [plans, search]);

  const closeCart = () => {
    setCartOpen(false);
    setCart(null);
    setCartError(null);
    setBuyError(null);
    setSubmittedRequestId(null);
  };

  const loadCartForPlan = async (
    planId: string | number,
    opts?: { billing?: string; quantity?: string }
  ) => {
    setCartOpen(true);
    setCartLoading(true);
    setCartError(null);
    setBuyError(null);
    setSubmittedRequestId(null);
    setStatusMsg('Fetching shopping cart…', 'busy');
    try {
      const data = await getCart(activeType, planId, {
        billing: opts?.billing,
        quantity: opts?.quantity ?? quantity,
      });
      setCart(data);
      setBilling(data.selectedBilling);
      setQuantity(String(data.quantity || 1));
      const selectedTpl =
        data.templates?.find((t) => t.selected)?.value ||
        data.templates?.[0]?.value ||
        '';
      setTemplate(selectedTpl);
      setStatusMsg(`Cart · ${data.name}`, 'ok');
    } catch (err) {
      setCart(null);
      const message = err instanceof Error ? err.message : 'Failed to load cart';
      setCartError(message);
      setStatusMsg('Cart fetch failed', 'err');
    } finally {
      setCartLoading(false);
    }
  };

  const onBillingChange = async (value: string) => {
    if (!cart) return;
    setBilling(value);
    setBuyError(null);
    setSubmittedRequestId(null);
    await loadCartForPlan(cart.planId, { billing: value, quantity });
  };

  const onQuantityChange = async (value: string) => {
    setQuantity(value);
    if (!cart) return;
    setBuyError(null);
    setSubmittedRequestId(null);
    await loadCartForPlan(cart.planId, { billing, quantity: value });
  };

  const onBuyNow = async () => {
    if (!cart) return;
    if (!template) {
      setBuyError('Select a template before Buy Now.');
      return;
    }
    const selectedTemplate = cart.templates?.find((t) => t.value === template);
    if (!selectedTemplate) {
      setBuyError('Selected template is invalid.');
      return;
    }
    if (cart.pricing?.total == null || Number.isNaN(Number(cart.pricing.total))) {
      setBuyError('Cart total is unavailable. Refresh the cart and try again.');
      return;
    }

    setBuyLoading(true);
    setBuyError(null);
    setSubmittedRequestId(null);
    try {
      const request = await submitCatalogVmRequest({
        category: activeType,
        planId: String(cart.planId),
        planName: cart.name,
        specs: {
          cpu: cart.specs?.cpu,
          ram: cart.specs?.ram,
          disk: cart.specs?.disk,
        },
        billing,
        quantity: Number(quantity) || 1,
        template: {
          value: selectedTemplate.value,
          label: selectedTemplate.label,
        },
        pricingSnapshot: {
          currency: cart.pricing.currency || 'INR',
          subtotal: cart.pricing.subtotal ?? undefined,
          tax: cart.pricing.tax ?? undefined,
          total: Number(cart.pricing.total),
          billingLabel: cart.pricing.taxLabel,
        },
      });
      setSubmittedRequestId(request._id);
      setStatusMsg('Wallet charged · VM is provisioning', 'ok');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to submit request';
      setBuyError(message);
      setStatusMsg('Buy request failed', 'err');
    } finally {
      setBuyLoading(false);
    }
  };

  const statusColor =
    statusKind === 'busy'
      ? 'text-amber-700'
      : statusKind === 'ok'
        ? 'text-green-700'
        : statusKind === 'err'
          ? 'text-red-700'
          : 'text-gray-500';

  return (
    <div className="relative mx-auto max-w-screen-xl space-y-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create VM</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Browse plans and configure checkout
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-xs ${statusColor}`}>{status}</span>
          <button
            type="button"
            onClick={() => void loadPlans(activeType)}
            disabled={loadingPlans}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a01717] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loadingPlans ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const on = tab.id === activeType;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === activeType) return;
                closeCart();
                void loadPlans(tab.id);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                on
                  ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                  : 'border-transparent bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
        <div>
          <span className="mr-1.5 font-mono text-[0.72rem] uppercase tracking-wider text-gray-400">
            Plans
          </span>
          <strong className="font-semibold text-gray-800">{filteredPlans.length}</strong>
        </div>
      </div>

      <div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by plan, CPU, RAM…"
          className="w-full max-w-md rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-gray-50 text-[0.74rem] font-semibold uppercase tracking-wider text-gray-500">
              <th className="w-12 px-3 py-3">#</th>
              <th className="px-3 py-3">Plan</th>
              <th className="px-3 py-3">CPU</th>
              <th className="px-3 py-3">RAM</th>
              <th className="px-3 py-3">Disk</th>
              <th className="px-3 py-3">Hourly</th>
              <th className="px-3 py-3">Monthly</th>
              <th className="px-3 py-3">Quarterly</th>
              <th className="px-3 py-3">Yearly</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {loadingPlans && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-gray-500">
                  Loading {activeType} plans…
                </td>
              </tr>
            )}
            {!loadingPlans && filteredPlans.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-gray-500">
                  {statusKind === 'err'
                    ? status
                    : search
                      ? 'No plans match this filter.'
                      : 'No plans available.'}
                </td>
              </tr>
            )}
            {!loadingPlans &&
              filteredPlans.map((p, idx) => (
                <tr
                  key={`${p.planId ?? p.plan}-${idx}`}
                  className="border-t border-gray-100 hover:bg-red-50/40"
                >
                  <td className="px-3 py-3 font-mono text-xs text-gray-400">
                    {p.sno ?? idx + 1}
                  </td>
                  <td className="min-w-[14rem] px-3 py-3 font-semibold text-gray-900">
                    {p.plan}
                  </td>
                  <td className="px-3 py-3 text-gray-700">{p.cpu || '—'}</td>
                  <td className="px-3 py-3 text-gray-700">{p.ram || '—'}</td>
                  <td className="px-3 py-3 text-gray-700">{p.disk || '—'}</td>
                  <td className="px-3 py-3">{priceCell(p.hourly)}</td>
                  <td className="px-3 py-3">{priceCell(p.monthly)}</td>
                  <td className="px-3 py-3">{priceCell(p.quarterly)}</td>
                  <td className="px-3 py-3">{priceCell(p.yearly)}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={p.planId == null}
                      onClick={() => {
                        if (p.planId == null) return;
                        void loadCartForPlan(p.planId);
                      }}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#a01717] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Add to Cart
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {cartOpen && (
        <>
          <button
            type="button"
            aria-label="Close cart"
            className="fixed inset-0 z-40 bg-gray-900/40"
            onClick={closeCart}
          />
          <aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            aria-hidden={!cartOpen}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Shopping cart</h2>
              <button
                type="button"
                onClick={closeCart}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close cart"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cartLoading && (
                <p className="text-sm text-gray-500">Loading cart…</p>
              )}
              {!cartLoading && cartError && (
                <p className="text-sm text-red-600">{cartError}</p>
              )}
              {!cartLoading && cart && (
                <div className="space-y-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[0.72rem] uppercase tracking-wider text-gray-400">
                      Billing cycle
                    </span>
                    <select
                      value={billing}
                      onChange={(e) => void onBillingChange(e.target.value)}
                      className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
                    >
                      {(cart.billingCycles || []).map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.value} — {inr(c.amount)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[0.72rem] uppercase tracking-wider text-gray-400">
                      Template
                    </span>
                    <select
                      value={template}
                      onChange={(e) => {
                        setTemplate(e.target.value);
                        setBuyError(null);
                        setSubmittedRequestId(null);
                      }}
                      className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
                    >
                      {(cart.templates || []).length === 0 ? (
                        <option value="">-- Select Template --</option>
                      ) : (
                        (cart.templates || []).map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[0.72rem] uppercase tracking-wider text-gray-400">
                      Quantity
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => void onQuantityChange(e.target.value)}
                      className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
                    />
                  </label>

                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{cart.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500">
                      {cart.specs?.cpu}
                      <br />
                      {cart.specs?.ram}
                      <br />
                      {cart.specs?.disk}
                    </p>
                  </div>

                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 font-mono text-gray-600">Sub Total</td>
                        <td className="py-2 text-right font-mono">
                          {inr(cart.pricing?.subtotal)}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 font-mono text-gray-600">
                          {cart.pricing?.taxLabel || 'Tax 18% GST'}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {inr(cart.pricing?.tax)}
                        </td>
                      </tr>
                      <tr>
                        <td className="pt-3 text-base font-bold text-gray-900">Total</td>
                        <td className="pt-3 text-right text-base font-bold font-mono text-gray-900">
                          {inr(cart.pricing?.total)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={buyLoading || Boolean(submittedRequestId)}
                      onClick={() => void onBuyNow()}
                      className="rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a01717] disabled:cursor-wait disabled:opacity-65"
                    >
                      {buyLoading
                        ? 'Submitting…'
                        : submittedRequestId
                          ? 'Request submitted'
                          : 'Buy Now'}
                    </button>
                  </div>

                  {(buyError || submittedRequestId) && (
                    <div className="rounded-lg border border-red-100 bg-red-50/60 p-3.5">
                      {buyError && (
                        <p className="text-sm text-red-700">{buyError}</p>
                      )}
                      {submittedRequestId && !buyError && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-green-800">
                            Wallet charged — VM is provisioning
                          </p>
                          <p className="text-sm text-gray-700">
                            It will be available soon. Track progress under My VM.
                          </p>
                          <Link
                            href="/console/create-vm/my-vms"
                            className="inline-flex text-sm font-medium text-[#B91C1C] hover:text-[#a01717]"
                          >
                            Open My VM →
                          </Link>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-400">
                    Buy Now deducts the total from your wallet and queues the VM for
                    provisioning. Super admin is notified to fulfill the request.
                  </p>
                </div>
              )}
              {!cartLoading && !cart && !cartError && (
                <p className="text-sm text-gray-500">Select a plan with Add to Cart.</p>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
