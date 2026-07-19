'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Loader2, User } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchCatalogVmRequesters,
  type CatalogVmRequesterGroup,
} from '@/lib/vmCatalogApi';
import { ErrorState } from '@/components/dashboard/ErrorState';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function WebyneVmRequestsHubPage() {
  const [requesters, setRequesters] = useState<CatalogVmRequesterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCatalogVmRequesters();
      setRequesters(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load requesters.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingTotal = requesters.reduce((sum, r) => sum + r.pendingCount, 0);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div>
        <Link
          href="/super-admin-console"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to console
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Webyne VM Request</h1>
          {!loading && (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              {pendingTotal} pending
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          Buy requests from platform admins, grouped by requester. Open a card to review.
        </p>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading requesters…
        </div>
      )}

      {!loading && !error && requesters.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <ClipboardList className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">No Webyne VM requests yet</p>
          <p className="mt-1 text-xs text-gray-400">
            When an admin clicks Buy Now in VM Catalog, their request appears here.
          </p>
        </div>
      )}

      {!loading && !error && requesters.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requesters.map((requester) => (
            <Link
              key={requester.adminId}
              href={`/super-admin-console/webyne-vm-requests/${requester.adminId}`}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#B91C1C] hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C] transition group-hover:bg-[#B91C1C] group-hover:text-white">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {requester.adminEmail}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Platform admin</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-amber-50 px-3 py-2">
                  <p className="text-lg font-bold text-amber-700">{requester.pendingCount}</p>
                  <p className="text-[11px] font-medium text-amber-600">Pending</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-lg font-bold text-gray-900">{requester.totalCount}</p>
                  <p className="text-[11px] font-medium text-gray-500">Total</p>
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-400">
                Last request · {formatDate(requester.lastRequestedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
