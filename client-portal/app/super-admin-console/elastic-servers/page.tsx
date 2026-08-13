'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Settings2,
  Upload,
} from 'lucide-react';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { ApiError } from '@/lib/apiClient';
import {
  fetchSuperAdminExternalVmOverview,
  type SuperAdminExternalVmOverviewRow,
} from '@/lib/superAdminExternalVmApi';
import { ManageExternalVmAssignmentsModal } from '@/components/super-admin-console/ManageExternalVmAssignmentsModal';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

function formatSchedule(
  schedule: SuperAdminExternalVmOverviewRow['assignments'][number]['schedule']
): string {
  if (!schedule) return 'Always on';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = (schedule.daysOfWeek ?? []).map((d) => days[d] ?? d).join(',');
  const from = schedule.effectiveFrom?.slice?.(0, 10) ?? String(schedule.effectiveFrom).slice(0, 10);
  const to = schedule.effectiveTo
    ? schedule.effectiveTo.slice?.(0, 10) ?? String(schedule.effectiveTo).slice(0, 10)
    : '∞';
  return `${from}→${to} · ${dow} · ${schedule.dailyStart}–${schedule.dailyEnd} (${schedule.timezone})`;
}

function PasswordReveal({ password }: { password: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-gray-700">
        {shown ? password || '—' : '••••••••'}
      </span>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label={shown ? 'Hide password' : 'Reveal password'}
      >
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const label =
    source === 'superadmin_bulk'
      ? 'Super-admin bulk'
      : source === 'tenant_import'
        ? 'Tenant import'
        : source === 'admin_import'
          ? 'Admin import'
          : source;
  return (
    <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'border-green-200 bg-green-50 text-green-800'
      : status === 'revoked'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}

export default function SuperAdminElasticServersOverviewPage() {
  const { toasts, addToast, dismiss } = useToast();
  const [rows, setRows] = useState<SuperAdminExternalVmOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stackFilter, setStackFilter] = useState<'all' | 'platform' | 'tenant'>('all');
  const [manageRow, setManageRow] = useState<SuperAdminExternalVmOverviewRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextRows = await fetchSuperAdminExternalVmOverview();
      setRows(nextRows);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load overview.';
      setError(message);
      addToast('error', message);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const nextRows = await fetchSuperAdminExternalVmOverview();
        if (!cancelled) setRows(nextRows);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof ApiError ? err.message : 'Failed to load overview.';
          setError(message);
          addToast('error', message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Initial load only — avoid re-fetch loop when addToast identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (stackFilter !== 'all' && row.stack !== stackFilter) return false;
      if (!q) return true;
      const hay = [
        row.name,
        row.ipAddress,
        row.username,
        row.adminEmail,
        row.tenantName,
        row.tenantSlug,
        row.source,
        ...row.assignments.map((a) => `${a.email ?? ''} ${a.username ?? ''}`),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, stackFilter]);

  return (
    <div className="mx-auto max-w-7xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {manageRow && (
        <ManageExternalVmAssignmentsModal
          row={manageRow}
          onClose={() => setManageRow(null)}
          onUpdated={(updated) => {
            setRows((prev) =>
              prev.map((r) => (r.externalVmId === updated.externalVmId ? updated : r))
            );
            setManageRow(updated);
          }}
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/super-admin-console"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" /> All services
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Server Import & Assign</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Bulk import external servers and assign to tenants/users with schedules.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/super-admin-console/elastic-servers/import"
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Upload className="h-4 w-4" />
            Server Import & Assign
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Search name, IP, user, tenant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={`${inputClass} w-40`}
          value={stackFilter}
          onChange={(e) => setStackFilter(e.target.value as typeof stackFilter)}
        >
          <option value="all">All stacks</option>
          <option value="platform">Platform</option>
          <option value="tenant">Tenant</option>
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={8} />
          </div>
        ) : error ? (
          <div className="p-6">
            <ErrorState message={error} onRetry={() => void load()} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500">
            No elastic servers found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">VM</th>
                  <th className="px-4 py-3">Stack / Owner</th>
                  <th className="px-4 py-3">Assignee(s)</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Password</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => {
                  const assignees =
                    row.assignments.length > 0
                      ? row.assignments
                      : [
                          {
                            assignmentId: 'none',
                            stack: row.stack,
                            email: null,
                            username: null,
                            status: 'unassigned',
                            schedule: null,
                          } as SuperAdminExternalVmOverviewRow['assignments'][number],
                        ];

                  return assignees.map((asg, idx) => (
                    <tr key={`${row.externalVmId}-${asg.assignmentId}-${idx}`} className="align-top">
                      {idx === 0 ? (
                        <>
                          <td className="px-4 py-3" rowSpan={assignees.length}>
                            <p className="font-medium text-gray-900">{row.name}</p>
                            <p className="font-mono text-xs text-gray-500">{row.ipAddress}</p>
                            <p className="text-xs text-gray-400">
                              {row.protocol.toUpperCase()} · {row.username}
                            </p>
                          </td>
                          <td className="px-4 py-3" rowSpan={assignees.length}>
                            <p className="text-xs font-medium uppercase text-gray-500">
                              {row.stack}
                            </p>
                            <p className="text-sm text-gray-800">
                              {row.stack === 'tenant'
                                ? row.tenantName ?? row.tenantId ?? '—'
                                : row.adminEmail ?? row.adminId ?? '—'}
                            </p>
                            {row.tenantSlug && (
                              <p className="text-xs text-gray-400">{row.tenantSlug}</p>
                            )}
                          </td>
                        </>
                      ) : null}
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">
                          {asg.email ?? asg.userId ?? asg.tenantUserId ?? '—'}
                        </p>
                        {asg.username && (
                          <p className="text-xs text-gray-400">@{asg.username}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-xs text-xs leading-relaxed text-gray-700">
                          {formatSchedule(asg.schedule)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={asg.status} />
                      </td>
                      {idx === 0 ? (
                        <>
                          <td className="px-4 py-3" rowSpan={assignees.length}>
                            <SourceBadge source={row.source} />
                          </td>
                          <td className="px-4 py-3" rowSpan={assignees.length}>
                            <PasswordReveal password={row.password} />
                          </td>
                          <td className="px-4 py-3" rowSpan={assignees.length}>
                            <div className="flex flex-col gap-1.5">
                              <button
                                type="button"
                                onClick={() => setManageRow(row)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                                Manage
                              </button>
                            </div>
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
