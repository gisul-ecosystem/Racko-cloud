'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Server } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { StatCardSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { useTenantAuth } from '@/context/TenantAuthContext';
import {
  createTenantOrder,
  getTenantOrderTemplates,
  getTenantWallet,
} from '@/lib/tenantPortalApi';
import { ApiError } from '@/lib/apiClient';
import type { TenantOrder, TenantOrderTemplate } from '@/types/tenantPortal';

function formatMoney(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function TenantPlaceOrderPage() {
  const { tenantUser } = useTenantAuth();
  const router = useRouter();

  const [templates, setTemplates] = useState<TenantOrderTemplate[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState('INR');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<TenantOrder | null>(null);
  const [insufficientBalance, setInsufficientBalance] = useState(false);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/dashboard/wallet');
    }
  }, [tenantUser, router]);

  useEffect(() => {
    if (tenantUser?.role !== 'tenant_admin') return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [tpls, wallet] = await Promise.all([
          getTenantOrderTemplates(),
          getTenantWallet(),
        ]);
        setTemplates(tpls);
        setBalance(wallet.balance);
        setCurrency(wallet.currency);
        if (tpls[0]) setSelectedId(tpls[0].templateId);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load templates.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [tenantUser]);

  const selected = useMemo(
    () => templates.find((t) => t.templateId === selectedId) ?? null,
    [templates, selectedId]
  );

  const estimatedTotal = selected ? count * selected.pricePerVm : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || count < 1) return;

    setSubmitting(true);
    setError(null);
    setInsufficientBalance(false);
    setSuccess(null);

    try {
      const order = await createTenantOrder(selectedId, count);

      if (order.status === 'pending_payment') {
        setInsufficientBalance(true);
        return;
      }

      setSuccess(order);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to place order.');
    } finally {
      setSubmitting(false);
    }
  }

  if (tenantUser?.role !== 'tenant_admin') {
    return null;
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  if (error && templates.length === 0) {
    return (
      <ErrorState title="Templates unavailable" message={error} onRetry={() => window.location.reload()} />
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h2 className="mt-4 text-lg font-semibold text-gray-900">Order submitted</h2>
        <p className="mt-2 text-sm text-gray-600">
          {success.templateName} × {success.count} — pending approval.
        </p>
        <Link
          href="/tenant/dashboard/orders"
          className="mt-6 inline-block rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#DC2626]"
        >
          View order history
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Place order</h1>
        <p className="text-sm text-gray-500">
          Wallet balance:{' '}
          <span className="font-medium text-gray-800">
            {balance !== null ? formatMoney(balance, currency) : '—'}
          </span>
        </p>
      </div>

      {insufficientBalance && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          Insufficient balance for this order.{' '}
          <Link href="/tenant/dashboard/wallet" className="font-semibold underline">
            Add funds in Wallet
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((tpl) => {
            const isSelected = tpl.templateId === selectedId;
            return (
              <button
                key={tpl.templateId}
                type="button"
                onClick={() => setSelectedId(tpl.templateId)}
                className={`rounded-xl border p-5 text-left transition ${
                  isSelected
                    ? 'border-[#B91C1C] bg-red-50 ring-1 ring-[#B91C1C]'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                    <Server className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{tpl.name}</p>
                    <p className="text-xs text-gray-500">Node: {tpl.node}</p>
                    <p className="mt-2 text-xs text-gray-600">
                      {tpl.baselineSpecs.cpuCores} vCPU · {tpl.baselineSpecs.memoryGb} GB RAM ·{' '}
                      {tpl.baselineSpecs.diskGb} GB disk
                    </p>
                    <p className="mt-2 text-sm font-medium text-[#B91C1C]">
                      {formatMoney(tpl.pricePerVm)}/VM/month
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <div>
            <label htmlFor="count" className="mb-1 block text-xs font-medium text-gray-500">
              VM count
            </label>
            <input
              id="count"
              type="number"
              min={1}
              step={1}
              value={count}
              onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="text-sm text-gray-600">
            Estimated total:{' '}
            <span className="text-base font-semibold text-gray-900">
              {formatMoney(estimatedTotal, currency)}
            </span>
          </div>
          <button
            type="submit"
            disabled={submitting || !selected}
            className="ml-auto rounded-lg bg-[#B91C1C] px-5 py-2 text-sm font-semibold text-white hover:bg-[#DC2626] disabled:opacity-50"
          >
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
        </div>
      </form>
    </div>
  );
}
