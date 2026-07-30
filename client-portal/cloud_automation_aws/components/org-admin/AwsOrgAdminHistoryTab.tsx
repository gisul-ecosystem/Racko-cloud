'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Clock,
  HardDrive,
  History,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
  User,
} from 'lucide-react';
import { formatCurrency, getAwsOrgLabHistory } from '../../api/orgAdminClient';
import type {
  AwsOrgAdminLabHistory,
  AwsOrgAdminLabHistoryTimelineEntry,
  AwsOrgAdminUser,
} from '../../types/orgAdmin';

function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function timelineIcon(entry: AwsOrgAdminLabHistoryTimelineEntry) {
  if (entry.type === 'cleanup_snapshot' || entry.type === 'cleanup_log') {
    return <Trash2 className="h-4 w-4 text-red-500" />;
  }
  if (entry.type === 'daily_usage') {
    return <Clock className="h-4 w-4 text-amber-500" />;
  }
  if (entry.type === 'admin_event') {
    return <History className="h-4 w-4 text-gray-500" />;
  }
  return entry.isActive ? (
    <Server className="h-4 w-4 text-green-500" />
  ) : (
    <User className="h-4 w-4 text-blue-500" />
  );
}

export function AwsOrgAdminHistoryTab({
  requestId,
  users,
  refreshToken,
}: {
  requestId: string;
  users: AwsOrgAdminUser[];
  refreshToken?: string | number | null;
}) {
  const [history, setHistory] = useState<AwsOrgAdminLabHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userIndex, setUserIndex] = useState('all');
  const [showTotalMtd, setShowTotalMtd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(
        await getAwsOrgLabHistory(requestId, {
          userIndex: userIndex === 'all' ? undefined : Number(userIndex),
          limit: 250,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AWS lab history.');
    } finally {
      setLoading(false);
    }
  }, [requestId, userIndex]);

  useEffect(() => {
    if (refreshToken == null) return;
    void load();
  }, [refreshToken, load]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalMtdSummary = useMemo(() => {
    const summaries = history?.userSummaries ?? [];
    const source =
      userIndex === 'all'
        ? summaries
        : summaries.filter((summary) => Number(summary.userIndex) === Number(userIndex));
    const total = source.reduce((sum, entry) => sum + Number(entry.awsCostMtdUsd || 0), 0);
    return {
      total,
      currency: history?.defaultCostCurrency || 'USD',
      userCount: source.length,
    };
  }, [history, userIndex]);

  if (loading && !history) {
    return (
      <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading lab history…
      </div>
    );
  }

  if (error && !history) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 text-sm font-medium text-[#B91C1C] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const summaries = history?.userSummaries ?? [];
  const timeline = history?.timeline?.length
    ? history.timeline
    : (history?.entries || []).map((entry) => ({
        id: String(entry.id),
        type: entry.type,
        at: entry.at,
        userIndex: entry.userIndex,
        username: entry.username,
        title: entry.title,
        subtitle: entry.subtitle || undefined,
        liveCostUsd: entry.costUsd,
        resourcesDeleted: entry.resourcesDeleted,
        status: entry.status,
      }));
  const defaultCostCurrency = history?.defaultCostCurrency || 'USD';

  return (
    <div className="space-y-5 px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#B91C1C]" />
            <h3 className="text-[15px] font-semibold text-gray-900">AWS Lab History</h3>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Sessions, cleanup snapshots, daily usage, and costs retained until this lab expires
            {history?.expiryDate
              ? ` (${new Date(history.expiryDate).toLocaleDateString()})`
              : ''}
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={userIndex}
            onChange={(event) => setUserIndex(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
          >
            <option value="all">All users</option>
            {users.map((user) => (
              <option key={user.userIndex} value={String(user.userIndex)}>
                {user.username}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowTotalMtd((current) => !current)}
            disabled={totalMtdSummary.userCount === 0}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
              showTotalMtd
                ? 'border-violet-300 bg-violet-50 text-violet-900'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Calculator className="h-4 w-4" />
            Total MTD
            {showTotalMtd ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {showTotalMtd && totalMtdSummary.userCount > 0 && (
        <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                Total AWS MTD — {userIndex === 'all' ? 'all users' : 'filtered'}
              </p>
              <p className="mt-1 text-2xl font-bold text-violet-950">
                {formatCurrency(totalMtdSummary.total, totalMtdSummary.currency)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Sum of month-to-date AWS spend across {totalMtdSummary.userCount} user
                {totalMtdSummary.userCount !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTotalMtd(false)}
              className="text-xs font-medium text-violet-800 hover:underline"
            >
              Hide
            </button>
          </div>
        </div>
      )}

      {summaries.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <div
              key={summary.userIndex}
              className="rounded-xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm"
            >
              <p className="text-sm font-semibold text-gray-900">{summary.username}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-600">
                <div>
                  <p className="font-medium uppercase tracking-wide text-gray-400">Total time</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {formatMinutes(summary.totalMinutesLifetime)}
                  </p>
                  <p className="text-gray-500">{summary.sessionCount} session(s)</p>
                </div>
                <div>
                  <p className="font-medium uppercase tracking-wide text-gray-400">Today</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {formatMinutes(summary.totalMinutesToday)}
                  </p>
                </div>
                <div>
                  <p className="font-medium uppercase tracking-wide text-gray-400">Live cost</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(summary.liveCostUsd, 'USD')}
                  </p>
                </div>
                <div>
                  <p className="font-medium uppercase tracking-wide text-gray-400">AWS MTD</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(summary.awsCostMtdUsd, summary.costCurrency || defaultCostCurrency)}
                  </p>
                </div>
                <div>
                  <p className="font-medium uppercase tracking-wide text-gray-400">Resources</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
                    <HardDrive className="h-3.5 w-3.5" />
                    {summary.currentResourceCount} live
                  </p>
                  <p className="text-gray-500">peak {summary.peakResourceCount}</p>
                </div>
                <div>
                  <p className="font-medium uppercase tracking-wide text-gray-400">Cleanups</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {summary.cleanupRunCount} recorded
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-100">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <h4 className="text-sm font-semibold text-gray-900">Activity timeline</h4>
          <p className="text-xs text-gray-500">
            Newest first — sessions, cleanup snapshots (with pre-cleanup resources & costs), and daily
            usage
          </p>
        </div>

        {!timeline.length ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            No history entries yet. Sessions and cleanup runs will appear here automatically.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {timeline.map((entry) => (
              <li key={entry.id} className="flex gap-3 px-4 py-3.5 hover:bg-gray-50/80">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
                  {timelineIcon(entry)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                    {entry.username && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {entry.username}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{formatDateTime(String(entry.at))}</span>
                  </div>
                  {entry.subtitle && (
                    <p className="mt-0.5 text-sm text-gray-600">{entry.subtitle}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                    {entry.minutes != null && <span>Time: {formatMinutes(entry.minutes)}</span>}
                    {entry.liveCostUsd != null && (
                      <span>Live: {formatCurrency(entry.liveCostUsd)}</span>
                    )}
                    {entry.awsCostMtdUsd != null && (
                      <span>AWS MTD: {formatCurrency(entry.awsCostMtdUsd, defaultCostCurrency)}</span>
                    )}
                    {entry.resourceCount != null && (
                      <span>Resources before cleanup: {entry.resourceCount}</span>
                    )}
                    {entry.peakResourceCount != null && <span>Peak: {entry.peakResourceCount}</span>}
                    {entry.resourcesDeleted != null && <span>Deleted: {entry.resourcesDeleted}</span>}
                    {entry.triggeredBy && <span>By: {entry.triggeredBy}</span>}
                    {entry.status && <span>Status: {entry.status}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
