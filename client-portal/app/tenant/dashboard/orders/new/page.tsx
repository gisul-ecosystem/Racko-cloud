'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Server } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { StatCardSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import {
  createTenantOrder,
  getTenantOrderCatalog,
  getTenantOrderTemplateDetail,
  getTenantWallet,
  quoteTenantOrder,
} from '@/lib/tenantPortalApi';
import { tenantAccentButton, tenantAccentSelectedBox } from '@/lib/tenantAccentStyles';
import { billingPeriodHelperText, parseBillingDiscounts } from '@/lib/billingPeriodUtils';
import { formatBillingPeriod } from '@/lib/tenantPlanUtils';
import { ApiError } from '@/lib/apiClient';
import type {
  BillingPeriod,
  OrderSpecs,
  PlaceOrderInput,
  TenantOrder,
  TenantOrderTemplate,
  TenantTemplateDetail,
  VmManagementPricing,
} from '@/types/tenantPortal';

const BILLING_PERIODS: BillingPeriod[] = ['monthly', 'quarterly', 'yearly'];

const ORDER_ERROR_MESSAGES: Record<string, string> = {
  TEMPLATE_NOT_ALLOWED_FOR_TENANT: 'This template is not available for your organization.',
  TEMPLATE_NOT_FOUND: 'Template not found.',
  SERVICE_NOT_ENABLED: 'VM management is not enabled for your organization.',
  TENANT_VM_LIMIT_EXCEEDED: 'This order would exceed your VM limit.',
  TENANT_VCPU_LIMIT_EXCEEDED: 'This order would exceed your vCPU limit.',
  TENANT_RAM_LIMIT_EXCEEDED: 'This order would exceed your RAM limit.',
  TENANT_DISK_LIMIT_EXCEEDED: 'This order would exceed your disk limit.',
  VALIDATION_ERROR: 'Specs must be at or above the template minimum.',
};

function formatMoney(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function orderErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return ORDER_ERROR_MESSAGES[err.code ?? err.message] ?? err.message;
  }
  return 'Failed to place order.';
}

export default function TenantPlaceOrderPage() {
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();

  const [templates, setTemplates] = useState<TenantOrderTemplate[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState('INR');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [catalogPricing, setCatalogPricing] = useState<VmManagementPricing | null>(null);
  const [count, setCount] = useState(1);
  const [specs, setSpecs] = useState<OrderSpecs | null>(null);
  const [quotedTotal, setQuotedTotal] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<TenantOrder | null>(null);
  const [insufficientBalance, setInsufficientBalance] = useState(false);
  const [templateDetail, setTemplateDetail] = useState<TenantTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/dashboard/my-vms');
    }
  }, [tenantUser, router]);

  useEffect(() => {
    if (tenantUser?.role !== 'tenant_admin') return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [catalog, wallet] = await Promise.all([
          getTenantOrderCatalog(),
          getTenantWallet(),
        ]);
        setTemplates(catalog.templates);
        setCatalogPricing(catalog.pricing);
        setBalance(wallet.balance);
        setCurrency(wallet.currency);
        if (catalog.templates[0]) {
          setSelectedId(catalog.templates[0].templateId);
          setSpecs({ ...catalog.templates[0].baselineSpecs });
        }
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

  const orderInput: PlaceOrderInput | null = useMemo(() => {
    if (!selectedId || !specs) return null;
    return {
      templateId: selectedId,
      count,
      billingPeriod,
      cpuCores: specs.cpuCores,
      memoryGb: specs.memoryGb,
      diskGb: specs.diskGb,
    };
  }, [selectedId, count, billingPeriod, specs]);

  const billingDiscounts = useMemo(
    () => parseBillingDiscounts(catalogPricing?.billingDiscounts),
    [catalogPricing]
  );

  const billingHelper = billingPeriodHelperText(billingPeriod, billingDiscounts);

  useEffect(() => {
    if (!orderInput || tenantUser?.role !== 'tenant_admin') return;

    const timer = setTimeout(() => {
      setQuoteLoading(true);
      void quoteTenantOrder(orderInput)
        .then((q) => setQuotedTotal(q.amount))
        .catch(() => setQuotedTotal(null))
        .finally(() => setQuoteLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [orderInput, tenantUser]);

  useEffect(() => {
    if (!selectedId || tenantUser?.role !== 'tenant_admin') {
      setTemplateDetail(null);
      return;
    }

    setDetailLoading(true);
    void getTenantOrderTemplateDetail(selectedId)
      .then(setTemplateDetail)
      .catch(() => setTemplateDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId, tenantUser]);

  function selectTemplate(tpl: TenantOrderTemplate) {
    setSelectedId(tpl.templateId);
    setSpecs({ ...tpl.baselineSpecs });
    setQuotedTotal(null);
  }

  function updateSpec(key: keyof OrderSpecs, value: number) {
    if (!selected) return;
    const min = selected.baselineSpecs[key];
    setSpecs((prev) => ({
      ...(prev ?? selected.baselineSpecs),
      [key]: Math.max(min, value),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderInput) return;

    setSubmitting(true);
    setError(null);
    setInsufficientBalance(false);
    setSuccess(null);

    try {
      const order = await createTenantOrder(orderInput);

      if (order.status === 'pending_payment') {
        setInsufficientBalance(true);
        return;
      }

      setSuccess(order);
    } catch (err) {
      setError(orderErrorMessage(err));
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
          className="mt-6 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          style={tenantAccentButton(accentColor)}
        >
          View order history
        </Link>
      </div>
    );
  }

  const estimatedTotal = quotedTotal ?? (selected ? count * selected.pricePerVm : 0);

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
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Billing period</h2>
          <p className="mt-1 text-xs text-gray-500">
            Locked for the VM plan after order fulfillment. Extend and renew use the same period.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {BILLING_PERIODS.map((period) => {
              const isSelected = billingPeriod === period;
              return (
                <button
                  key={period}
                  type="button"
                  onClick={() => setBillingPeriod(period)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    isSelected
                      ? 'border text-gray-900'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                  style={isSelected ? tenantAccentSelectedBox(accentColor) : undefined}
                >
                  {formatBillingPeriod(period)}
                </button>
              );
            })}
          </div>
          {billingHelper ? (
            <p className="mt-2 text-xs text-gray-600">{billingHelper}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((tpl) => {
            const isSelected = tpl.templateId === selectedId;
            return (
              <button
                key={tpl.templateId}
                type="button"
                onClick={() => selectTemplate(tpl)}
                className={`rounded-xl border p-5 text-left transition ${
                  isSelected ? 'border' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                style={isSelected ? tenantAccentSelectedBox(accentColor) : undefined}
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
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {formatMoney(tpl.pricePerVm)}/VM/month
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Template details</h2>
            {detailLoading ? (
              <p className="mt-2 text-sm text-gray-500">Loading template info…</p>
            ) : templateDetail ? (
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-gray-500">Template ID</dt>
                  <dd className="text-gray-900">{templateDetail.templateId}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Node</dt>
                  <dd className="text-gray-900">{templateDetail.node}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-gray-500">Baseline specs</dt>
                  <dd className="text-gray-900">
                    {templateDetail.baselineSpecs.cpuCores} vCPU ·{' '}
                    {templateDetail.baselineSpecs.memoryGb} GB RAM ·{' '}
                    {templateDetail.baselineSpecs.diskGb} GB disk
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-gray-500">Pricing rates (monthly)</dt>
                  <dd className="text-gray-900">
                    CPU {formatMoney(templateDetail.pricing.cpuRatePerCoreMonthly)}/core · RAM{' '}
                    {formatMoney(templateDetail.pricing.ramRatePerGbMonthly)}/GB · Disk{' '}
                    {formatMoney(templateDetail.pricing.diskRatePerGbMonthly)}/GB
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Template details unavailable.</p>
            )}
          </div>
        )}

        {selected && specs ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Spec overrides (optional)</h2>
            <p className="mt-1 text-xs text-gray-500">
              Values must be at or above the template baseline.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {(
                [
                  ['cpuCores', 'vCPU', selected.baselineSpecs.cpuCores, 1],
                  ['memoryGb', 'RAM (GB)', selected.baselineSpecs.memoryGb, 0.5],
                  ['diskGb', 'Disk (GB)', selected.baselineSpecs.diskGb, 1],
                ] as const
              ).map(([key, label, min, step]) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    {label} (min {min})
                  </label>
                  <input
                    type="number"
                    min={min}
                    step={step}
                    value={specs[key]}
                    onChange={(e) => updateSpec(key, Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
            {quoteLoading ? 'Calculating…' : 'Estimated total:'}{' '}
            <span className="text-base font-semibold text-gray-900">
              {formatMoney(estimatedTotal, currency)}
            </span>
          </div>
          <button
            type="submit"
            disabled={submitting || !selected}
            className="ml-auto rounded-lg px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            style={tenantAccentButton(accentColor)}
          >
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
        </div>
      </form>
    </div>
  );
}
