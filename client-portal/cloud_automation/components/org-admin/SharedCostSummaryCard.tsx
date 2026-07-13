'use client';

import { Loader2, RefreshCw } from 'lucide-react';

import { formatSyncedAgo } from '../../utils/costDisplayUtils';
import { formatMinutes } from '../../utils/formatters';

import type { OrgAdminSharedAzureCostSummary } from '../../types/orgAdmin';

interface SharedCostSummaryCardProps {
  summary: OrgAdminSharedAzureCostSummary | null;
  loading: boolean;
  onRefresh: () => void;
}

export function SharedCostSummaryCard({ summary, loading, onRefresh }: SharedCostSummaryCardProps) {
  const nowMs = Date.now();
  const mtd = summary?.monthToDateCost ?? 0;
  const currency = summary?.currency ?? 'USD';
  const totalMinutes = summary?.totalMergedMinutesMtd ?? 0;
  const syncedAt = summary?.queriedAt ?? null;
  const resourceGroup = summary?.resourceGroup ?? '—';

  return (
    <div className="mx-6 mb-4 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50/80 to-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Shared resource group cost
          </p>
          <p className="mt-1 font-mono text-[11px] text-gray-500">{resourceGroup}</p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-800 transition hover:bg-violet-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh Azure MTD
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[11px] text-gray-500">Azure Cost MTD (whole RG)</p>
          <p className="text-lg font-semibold text-violet-900">
            {currency} {mtd.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500">Last synced</p>
          <p className="text-sm font-medium text-gray-800">
            {syncedAt ? formatSyncedAgo(syncedAt, nowMs) : 'never'}
          </p>
          {syncedAt && (
            <p className="text-[10px] text-gray-400">{new Date(syncedAt).toLocaleString()}</p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-gray-500">Tracked minutes (MTD, merged)</p>
          <p className="text-sm font-medium text-gray-800">{formatMinutes(totalMinutes)}</p>
          <p className="text-[10px] text-gray-400">all users · billing period</p>
        </div>
      </div>

      {summary?.dataFreshnessNote && (
        <p className="mt-2 text-[11px] text-gray-500">{summary.dataFreshnessNote}</p>
      )}
    </div>
  );
}
