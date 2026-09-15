'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import {
  fetchConsoleSessions,
  type ConsoleSessionEntry,
  type ConsoleSessionSummary,
} from '../../../../lib/consoleSessionApi';
import {
  Activity,
  Users,
  Clock,
  Wifi,
  RefreshCw,
  Download,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function exportToCsv(sessions: ConsoleSessionEntry[]) {
  const headers = ['User Email', 'Server', 'Login Time', 'Logout Time', 'Duration', 'Status'];
  const rows = sessions.map((s) => [
    s.userEmail,
    s.serverName,
    formatDateTime(s.loginAt),
    s.logoutAt ? formatDateTime(s.logoutAt) : '—',
    formatDuration(s.durationSeconds),
    s.isActive ? 'Active' : 'Completed',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `console-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`mt-1.5 text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { isAuthenticated } = useAuth();

  const [sessions, setSessions] = useState<ConsoleSessionEntry[]>([]);
  const [summary, setSummary] = useState<ConsoleSessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchConsoleSessions({
        from: fromDate || undefined,
        to: toDate ? `${toDate}T23:59:59Z` : undefined,
        page,
        limit: LIMIT,
      });
      setSessions(result.sessions);
      setSummary(result.summary);
      setTotalPages(result.pagination.pages);
      setTotal(result.pagination.total);
    } catch {
      setError('Failed to load session data.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, fromDate, toDate, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Client-side search + status filter
  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      s.userEmail.toLowerCase().includes(q) ||
      s.serverName.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && s.isActive) ||
      (statusFilter === 'completed' && !s.isActive);
    return matchSearch && matchStatus;
  });

  return (
    <div className="max-w-screen-xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Session Analytics</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Console login &amp; logout history across all your users
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => exportToCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            icon={Activity}
            label="Sessions Today"
            value={summary.sessionsToday}
            color="text-blue-600"
          />
          <SummaryCard
            icon={Users}
            label="Active Users Today"
            value={summary.uniqueUsersToday}
            color="text-purple-600"
          />
          <SummaryCard
            icon={Clock}
            label="Avg Session Duration"
            value={formatDuration(summary.avgDurationSeconds)}
            color="text-amber-600"
            sub="completed sessions today"
          />
          <SummaryCard
            icon={Wifi}
            label="Currently Live"
            value={summary.activeSessions}
            color="text-green-600"
            sub={summary.activeSessions > 0 ? 'users connected now' : 'no active sessions'}
          />
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user or server…"
            className="h-9 w-56 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:border-[#B91C1C] focus:outline-none"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:border-[#B91C1C] focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'completed')}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:border-[#B91C1C] focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
        {(fromDate || toDate || search || statusFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setFromDate(''); setToDate(''); setStatusFilter('all'); setPage(1); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <Activity className="h-7 w-7 text-gray-400" />
            </div>
            <p className="font-medium text-gray-600">No sessions found</p>
            <p className="mt-1 text-sm text-gray-400">
              Sessions will appear here once users connect to a server.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['User', 'Server', 'Login Time', 'Logout Time', 'Duration', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr
                      key={s._id}
                      className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                        i % 2 !== 0 ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                            {s.userEmail[0]?.toUpperCase() ?? '?'}
                          </div>
                          <span className="font-medium text-gray-900 truncate max-w-[180px]" title={s.userEmail}>
                            {s.userEmail}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 font-mono text-xs">{s.serverName}</td>
                      <td className="px-5 py-3.5 text-xs text-gray-600">{formatDateTime(s.loginAt)}</td>
                      <td className="px-5 py-3.5 text-xs text-gray-600">
                        {s.logoutAt ? formatDateTime(s.logoutAt) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs font-medium text-gray-700">
                        {s.isActive ? (
                          <LiveDuration loginAt={s.loginAt} />
                        ) : (
                          formatDuration(s.durationSeconds)
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {s.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            Completed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                <p className="text-xs text-gray-500">
                  {total} total session{total !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Live duration counter for active sessions ────────────────────────────────

function LiveDuration({ loginAt }: { loginAt: string }) {
  const [seconds, setSeconds] = useState(() =>
    Math.round((Date.now() - new Date(loginAt).getTime()) / 1000)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(Math.round((Date.now() - new Date(loginAt).getTime()) / 1000));
    }, 10_000); // update every 10s — no need to be tick-perfect
    return () => clearInterval(interval);
  }, [loginAt]);

  return <span className="text-green-600">{formatDuration(seconds)} (live)</span>;
}
