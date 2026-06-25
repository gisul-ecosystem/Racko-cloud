'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { StatCardSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { OrderStatusBadge } from '@/components/tenant/OrderStatusBadge';
import { useTenantAuth } from '@/context/TenantAuthContext';
import {
  getTenantWallet,
  listTenantOrders,
  listTenantPlans,
} from '@/lib/tenantPortalApi';
import { formatBillingPeriod } from '@/lib/tenantPlanUtils';
import { ApiError } from '@/lib/apiClient';
import type { TenantOrder, TenantPlan } from '@/types/tenantPortal';

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

export default function TenantOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { tenantUser } = useTenantAuth();
  const router = useRouter();

  const [order, setOrder] = useState<TenantOrder | null>(null);
  const [plans, setPlans] = useState<TenantPlan[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/dashboard/wallet');
    }
  }, [tenantUser, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orders, wallet, planList] = await Promise.all([
        listTenantOrders(),
        getTenantWallet(),
        listTenantPlans().catch(() => [] as TenantPlan[]),
      ]);
      const found = orders.find((o) => o.id === orderId) ?? null;
      if (!found) {
        setError('Order not found.');
        setOrder(null);
      } else {
        setOrder(found);
      }
      setBalance(wallet.balance);
      setPlans(planList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load order.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_admin') void load();
  }, [tenantUser, load]);

  const linkedPlans = useMemo(
    () => plans.filter((p) => p.orderId === orderId),
    [plans, orderId]
  );

  if (tenantUser?.role !== 'tenant_admin') return null;

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  if (error || !order) {
    return (
      <ErrorState
        title="Order not found"
        message={error ?? 'This order could not be loaded.'}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/tenant/dashboard/orders"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Order history
      </Link>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{order.templateName}</h1>
            <p className="text-sm text-gray-500">Order {order.id}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-gray-500">Specs</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {order.specs.cpuCores} vCPU · {order.specs.memoryGb} GB RAM · {order.specs.diskGb} GB
              disk
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">VM count</dt>
            <dd className="mt-1 text-sm text-gray-900">{order.count}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Billing period</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {formatBillingPeriod(order.billingPeriod ?? 'monthly')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Amount</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {formatMoney(order.calculatedAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDateTime(order.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Updated</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDateTime(order.updatedAt)}</dd>
          </div>
        </dl>

        {order.status === 'rejected' && order.rejectionReason ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Rejection reason: {order.rejectionReason}
          </div>
        ) : null}

        {(order.status === 'provisioning' || order.status === 'fulfilled') && order.provisionJobId ? (
          <p className="mt-4 font-mono text-xs text-green-700">
            Provision job: {order.provisionJobId}
          </p>
        ) : null}

        {order.status === 'pending_payment' && (
          <div className="mt-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            <p>This order is waiting for wallet payment.</p>
            {balance !== null && (
              <p className="mt-1">
                Wallet balance: <strong>{formatMoney(balance)}</strong>
                {balance < order.calculatedAmount ? ' (insufficient)' : ''}
              </p>
            )}
            <div className="mt-3">
              <Link
                href="/tenant/dashboard/wallet"
                className="inline-flex rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-900 hover:bg-orange-50"
              >
                Add funds
              </Link>
            </div>
          </div>
        )}

        {linkedPlans.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">VM plans</p>
            <ul className="mt-2 space-y-1">
              {linkedPlans.map((plan) => (
                <li key={plan.vmId}>
                  <Link
                    href={`/tenant/dashboard/plans/${plan.vmId}`}
                    className="text-sm font-medium text-gray-900 hover:underline"
                  >
                    {plan.name} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
