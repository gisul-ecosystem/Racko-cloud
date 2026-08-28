'use client';

import { RefreshCw, Server } from 'lucide-react';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { MyVmDashboardTable, type CatalogPowerActionHandler } from '@/components/my-vm-dashboard/MyVmDashboardTable';

export function MyVmDashboardView({
  rows,
  loading,
  error,
  refetch,
  catalogPowerAction,
}: {
  rows: Array<import('@/lib/myVmDashboardApi').MyVmDashboardRow>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  catalogPowerAction?: CatalogPowerActionHandler;
}) {
  return (
    <div className="max-w-screen-xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My VM Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Loading…' : `${rows.length} VM${rows.length !== 1 ? 's' : ''} across all services`}
          </p>
        </div>
        <button
          type="button"
          onClick={refetch}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <Server className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No VMs found yet.</p>
          <p className="mt-1 max-w-sm text-xs text-gray-400">
            VPS Hosting, VM Catalog, and Elastic Server Import VMs will appear here in one place.
          </p>
        </div>
      ) : (
        <MyVmDashboardTable rows={rows} catalogPowerAction={catalogPowerAction} />
      )}
    </div>
  );
}
