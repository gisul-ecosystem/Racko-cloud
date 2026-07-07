'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  approveSuperAdminOrder,
  fetchSuperAdminOrders,
  fetchTenants,
  rejectSuperAdminOrder,
} from '@/lib/tenantApi';
import type { SuperAdminOrder, Tenant } from '@/lib/tenantTypes';
import { formatBillingPeriod } from '@/lib/tenantPlanUtils';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { OrderStatusBadge } from '@/components/tenant/OrderStatusBadge';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';

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

export default function SuperAdminOrdersPage() {
  const [orders, setOrders] = useState<SuperAdminOrder[]>([]);
  const [tenants, setTenants] = useState<Record<string, Tenant>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    'pending_approval' | 'provisioning' | 'all'
  >('pending_approval');
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderList, tenantList] = await Promise.all([
        fetchSuperAdminOrders(
          statusFilter === 'all'
            ? undefined
            : statusFilter
        ),
        fetchTenants({ limit: 200 }),
      ]);
      setOrders(orderList);
      const map: Record<string, Tenant> = {};
      tenantList.tenants.forEach((t) => {
        map[t.id] = t;
      });
      setTenants(map);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove(orderId: string) {
    setActionId(orderId);
    setSuccessMsg(null);
    try {
      const order = await approveSuperAdminOrder(orderId);
      setSuccessMsg(
        order.provisionJobId
          ? `Order approved. Provision job: ${order.provisionJobId}`
          : 'Order approved and provisioning started.'
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Approve failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectId || !rejectReason.trim()) return;
    setActionId(rejectId);
    setSuccessMsg(null);
    try {
      await rejectSuperAdminOrder(rejectId, rejectReason.trim());
      setRejectId(null);
      setRejectReason('');
      setSuccessMsg('Order rejected and wallet refunded.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reject failed.');
    } finally {
      setActionId(null);
    }
  }

  const displayed =
    statusFilter === 'all'
      ? orders
      : orders.filter((o) => o.status === statusFilter);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant orders</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and approve VM orders from white-label tenants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'pending_approval' | 'provisioning' | 'all')
            }
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="pending_approval">Pending approval</option>
            <option value="provisioning">Provisioning</option>
            <option value="all">All orders</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : error ? (
        <ErrorState title="Orders unavailable" message={error} onRetry={() => void load()} />
      ) : displayed.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
          No orders{statusFilter !== 'all' ? ` (${statusFilter.replace('_', ' ')})` : ''}.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Specs</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((order) => {
                  const tenant = tenants[order.tenantId];
                  const busy = actionId === order.id;
                  return (
                    <tr key={order.id} className="border-b border-gray-50 align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {tenant?.name ?? order.tenantId}
                        </p>
                        {tenant ? (
                          <p className="text-xs text-gray-500">{tenant.domain}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-gray-400">{formatDate(order.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{order.templateName}</p>
                        <p className="text-xs text-gray-500">× {order.count}</p>
                        {order.provisionJobId ? (
                          <p className="mt-1 font-mono text-xs text-green-700">
                            Job: {order.provisionJobId}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {order.specs.cpuCores} vCPU · {order.specs.memoryGb} GB RAM ·{' '}
                        {order.specs.diskGb} GB disk
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {formatMoney(order.calculatedAmount)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatBillingPeriod(order.billingPeriod ?? 'monthly')}
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.status} />
                        {order.rejectionReason ? (
                          <p className="mt-1 text-xs text-red-600">{order.rejectionReason}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {order.status === 'pending_approval' ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleApprove(order.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setRejectId(order.id);
                                setRejectReason('');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">Reject order</h2>
            <p className="mt-1 text-sm text-gray-500">
              The order amount will be refunded to the tenant wallet.
            </p>
            <form onSubmit={handleReject} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Reason</label>
                <textarea
                  required
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Explain why this order was rejected…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectId(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!rejectReason.trim() || actionId === rejectId}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Reject order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        <Link href="/super-admin-console/white-labelling" className="hover:text-[#B91C1C]">
          ← Back to White Labelling overview
        </Link>
      </p>
    </div>
  );
}
