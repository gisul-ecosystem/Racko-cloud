'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlusCircle } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { OrderStatusBadge } from '@/components/tenant/OrderStatusBadge';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { listTenantOrders } from '@/lib/tenantPortalApi';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { formatBillingPeriod } from '@/lib/tenantPlanUtils';
import { ApiError } from '@/lib/apiClient';
import type { TenantOrder } from '@/types/tenantPortal';

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function TenantOrderHistoryPage() {
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();
  const [orders, setOrders] = useState<TenantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/dashboard/admin/vms');
    }
  }, [tenantUser, router]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTenantOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantUser?.role === 'tenant_admin') {
      void load();
    }
  }, [tenantUser]);

  if (tenantUser?.role !== 'tenant_admin') {
    return null;
  }

  if (loading) {
    return <TableSkeleton rows={5} cols={7} />;
  }

  if (error) {
    return <ErrorState title="Orders unavailable" message={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-900">Order history</h1>
        <Link
          href="/tenant/dashboard/admin/vms/create"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          style={tenantAccentButton(accentColor)}
        >
          <PlusCircle className="h-4 w-4" />
          Place new order
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {orders.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Specs</th>
                  <th className="px-4 py-3">Count</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => router.push(`/tenant/dashboard/admin/jobs/${order.id}`)}
                    className="cursor-pointer border-b border-gray-50 align-top transition hover:bg-gray-50/80"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{order.templateName}</p>
                      {(order.status === 'fulfilled' || order.status === 'provisioning') &&
                      order.provisionJobId ? (
                        <p className="mt-1 font-mono text-xs text-green-700">
                          Job: {order.provisionJobId}
                        </p>
                      ) : null}
                      {order.status === 'rejected' && order.rejectionReason ? (
                        <p className="mt-1 text-xs text-red-600">{order.rejectionReason}</p>
                      ) : null}
                      {order.status === 'pending_payment' ? (
                        <p className="mt-1 text-xs text-orange-600">
                          Top up wallet to complete this order.
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {order.specs.cpuCores} vCPU · {order.specs.memoryGb} GB RAM ·{' '}
                      {order.specs.diskGb} GB disk
                    </td>
                    <td className="px-4 py-3 text-gray-700">{order.count}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {formatMoney(order.calculatedAmount)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatBillingPeriod(order.billingPeriod ?? 'monthly')}
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
