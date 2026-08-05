'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Receipt } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import type { AdminServiceKey } from '@/lib/adminServicesApi';
import { getTenantWalletTransactions } from '@/lib/tenantPortalApi';
import type { TenantWalletTransaction } from '@/types/tenantPortal';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import {
  fetchTenantProject,
  PROJECT_SERVICE_LABELS,
  type OrgProject,
} from '@/lib/tenantProjectsApi';

const PAGE_SIZE = 25;

const REASON_LABELS: Record<string, string> = {
  vm_creation: 'VM creation',
  azure_lab_request: 'Azure lab request',
  aws_lab_request: 'AWS lab request',
  catalog_vm_purchase: 'Catalog VM purchase',
  dedicated_server_purchase: 'Dedicated server purchase',
  manual_credit: 'Manual credit',
  razorpay_topup: 'Wallet top-up',
  refund: 'Refund',
};

function formatInr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function serviceLabel(key: string | null | undefined): string {
  if (!key) return 'Unattributed';
  if (key in PROJECT_SERVICE_LABELS) {
    return PROJECT_SERVICE_LABELS[key as AdminServiceKey];
  }
  return key;
}

export default function TenantProjectTransactionsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = String(params?.id || '');
  const serviceKey = searchParams?.get('serviceKey')?.trim() || null;

  const [project, setProject] = useState<OrgProject | null>(null);
  const [rows, setRows] = useState<TenantWalletTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [p, result] = await Promise.all([
        fetchTenantProject(projectId),
        getTenantWalletTransactions(page, PAGE_SIZE, {
          projectId,
          ...(serviceKey ? { serviceKey } : {}),
        }),
      ]);
      setProject(p);
      setRows(result.transactions);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, [projectId, serviceKey, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalDebit = useMemo(
    () => rows.filter((r) => r.type === 'debit').reduce((sum, r) => sum + r.amount, 0),
    [rows]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-screen-xl space-y-6">
      <div>
        <Link
          href={tenantConsole.project(projectId)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to project
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {project ? (
                <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                  {project.name}
                </span>
              ) : null}
              {serviceKey ? (
                <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  {serviceLabel(serviceKey)}
                </span>
              ) : null}
              {serviceKey ? (
                <Link
                  href={`${tenantConsole.project(projectId)}/transactions`}
                  className="text-xs font-semibold text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
                >
                  All services
                </Link>
              ) : null}
            </div>
          </div>
          {!loading && rows.length > 0 ? (
            <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
              Spend on this page:{' '}
              <span className="font-bold text-gray-900">{formatInr(totalDebit)}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" />
          </div>
        ) : error ? (
          <p className="px-6 py-10 text-center text-sm text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[22rem] flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <Receipt className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-base font-semibold text-gray-700">No transactions yet</p>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              Wallet charges made from this project
              {serviceKey ? ` for ${serviceLabel(serviceKey)}` : ''} will appear here.
              Use a service from the project card to create a charge.
            </p>
            <Link
              href={tenantConsole.project(projectId)}
              className="mt-5 inline-flex items-center rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#991B1B]"
            >
              Back to project services
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Reference</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-right">Balance after</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3 text-gray-600">{formatDateTime(tx.createdAt)}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      {serviceLabel(tx.serviceKey)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-900">
                    {REASON_LABELS[tx.reason] || tx.reason}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">
                    {tx.relatedOrderId || '—'}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-semibold ${
                      tx.type === 'debit' ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {tx.type === 'debit' ? '−' : '+'}
                    {formatInr(tx.amount)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">
                    {formatInr(tx.balanceAfter)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={
                        serviceKey
                          ? `${tenantConsole.project(projectId)}/transactions/${tx.id}?serviceKey=${encodeURIComponent(serviceKey)}`
                          : `${tenantConsole.project(projectId)}/transactions/${tx.id}`
                      }
                      className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                    >
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page} of {totalPages} · {total} transactions
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
