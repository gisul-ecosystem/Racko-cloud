'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { StatCardSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { PlanStatusBadge } from '@/components/tenant/PlanStatusBadge';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import {
  extendTenantPlan,
  getTenantPlan,
  getTenantWallet,
  listTenantPlanHistory,
  quoteTenantPlan,
  renewTenantPlan,
} from '@/lib/tenantPortalApi';
import {
  formatBillingPeriod,
  formatPlanPeriodEnd,
  planExpiryLabel,
} from '@/lib/tenantPlanUtils';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { ApiError } from '@/lib/apiClient';
import type { TenantPlan, TenantPlanHistoryEntry, TenantPlanQuote } from '@/types/tenantPortal';

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function TenantPlanDetailPage() {
  const params = useParams();
  const vmId = params.vmId as string;
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();

  const [plan, setPlan] = useState<TenantPlan | null>(null);
  const [history, setHistory] = useState<TenantPlanHistoryEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quote, setQuote] = useState<TenantPlanQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [renewVmStatus, setRenewVmStatus] = useState<string | null>(null);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/dashboard/wallet');
    }
  }, [tenantUser, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planData, historyData, wallet] = await Promise.all([
        getTenantPlan(vmId),
        listTenantPlanHistory(vmId),
        getTenantWallet(),
      ]);
      setPlan(planData);
      setHistory(historyData);
      setBalance(wallet.balance);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load plan.');
    } finally {
      setLoading(false);
    }
  }, [vmId]);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_admin') void load();
  }, [tenantUser, load]);

  async function openConfirm() {
    setActionError(null);
    setQuote(null);
    setShowConfirm(true);
    setQuoteLoading(true);
    try {
      const q = await quoteTenantPlan(vmId);
      setQuote(q);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to load quote.');
      setShowConfirm(false);
    } finally {
      setQuoteLoading(false);
    }
  }

  async function executeAction() {
    if (!plan || !quote) return;

    setSubmitting(true);
    setActionError(null);
    setSuccessMsg(null);
    setRenewVmStatus(null);

    try {
      const result =
        quote.action === 'extend'
          ? await extendTenantPlan(vmId)
          : await renewTenantPlan(vmId);

      setShowConfirm(false);
      setSuccessMsg(
        quote.action === 'extend'
          ? `Plan extended through ${formatPlanPeriodEnd(result.planPeriodEnd)}.`
          : `Plan renewed through ${formatPlanPeriodEnd(result.planPeriodEnd)}.`
      );
      if (result.vmStatus) setRenewVmStatus(result.vmStatus);
      await load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Action failed.';
      if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance')) {
        setActionError('Insufficient wallet balance. Add funds and try again.');
      } else {
        setActionError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (tenantUser?.role !== 'tenant_admin') return null;

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <ErrorState
        title="Plan not found"
        message={error ?? 'This VM plan could not be loaded.'}
        onRetry={() => void load()}
      />
    );
  }

  const canAct = plan.canExtend || plan.canRenew;
  const actionLabel = plan.canExtend ? 'Extend plan' : plan.canRenew ? 'Renew plan' : null;
  const insufficientForQuote = quote && balance !== null && balance < quote.amount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/tenant/dashboard/plans"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          All plans
        </Link>
      </div>

      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>{successMsg}</p>
              {renewVmStatus ? (
                <p className="mt-1 text-xs">VM power state: {renewVmStatus}</p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {actionError && !showConfirm && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionError}
          {actionError.includes('balance') ? (
            <Link href="/tenant/dashboard/wallet" className="ml-1 font-semibold underline">
              Go to Wallet
            </Link>
          ) : null}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{plan.name}</h1>
            <p className="text-sm text-gray-500">
              {plan.vmid} · Node {plan.node} · Power {plan.status}
            </p>
          </div>
          <PlanStatusBadge plan={plan} />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-gray-500">Specs</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {plan.specs.cpuCores} vCPU · {plan.specs.memoryGb} GB RAM · {plan.specs.diskGb} GB disk
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Period end</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatPlanPeriodEnd(plan.planPeriodEnd)}</dd>
            <dd className="text-xs text-gray-500">{planExpiryLabel(plan)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Billing period</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatBillingPeriod(plan.billingPeriod)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Renewal amount</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {formatMoney(plan.renewalAmount)}
            </dd>
          </div>
        </dl>

        {balance !== null && (
          <p className="mt-4 text-sm text-gray-500">
            Wallet balance:{' '}
            <span className="font-medium text-gray-800">{formatMoney(balance)}</span>
          </p>
        )}

        {canAct && actionLabel ? (
          <button
            type="button"
            onClick={() => void openConfirm()}
            className="mt-6 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            style={tenantAccentButton(accentColor)}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Payment history</h2>
        </div>
        {history.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No extend or renew payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-600">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-2 capitalize text-gray-900">
                      {row.reason.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {formatMoney(row.amount)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{formatMoney(row.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              {plan.canExtend ? 'Confirm extend' : 'Confirm renew'}
            </h3>

            {quoteLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading quote…
              </div>
            ) : quote ? (
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <p>
                  Amount:{' '}
                  <span className="font-semibold text-gray-900">{formatMoney(quote.amount)}</span>{' '}
                  ({formatBillingPeriod(quote.billingPeriod)})
                </p>
                <p>
                  Current end:{' '}
                  <span className="text-gray-900">
                    {formatPlanPeriodEnd(quote.currentPlanPeriodEnd)}
                  </span>
                </p>
                <p>
                  New end:{' '}
                  <span className="font-semibold text-gray-900">
                    {formatPlanPeriodEnd(quote.projectedPlanPeriodEnd)}
                  </span>
                </p>
                {balance !== null && (
                  <p>
                    Wallet balance:{' '}
                    <span
                      className={
                        insufficientForQuote ? 'font-semibold text-red-700' : 'text-gray-900'
                      }
                    >
                      {formatMoney(balance)}
                    </span>
                  </p>
                )}
                {insufficientForQuote && (
                  <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-800">
                    Insufficient balance.{' '}
                    <Link href="/tenant/dashboard/wallet" className="font-semibold underline">
                      Add funds
                    </Link>
                  </p>
                )}
                {actionError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                    {actionError}
                  </p>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setShowConfirm(false);
                  setActionError(null);
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || quoteLoading || !quote || !!insufficientForQuote}
                onClick={() => void executeAction()}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                style={tenantAccentButton(accentColor)}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {plan.canExtend ? 'Extend' : 'Renew'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
