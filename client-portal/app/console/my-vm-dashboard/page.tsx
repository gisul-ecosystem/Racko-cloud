'use client';

import { RefreshCw, Server } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAdminMyVmDashboard } from '@/hooks/useAdminMyVmDashboard';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { formatAssignmentHolders } from '@/lib/externalVmAssignmentFormat';
import type { MyVmDashboardRow } from '@/lib/myVmDashboardApi';
import type { ExternalVMProtocol } from '@/lib/externalVmApi';
import { externalVmProtocolBadgeClass } from '@/lib/externalVmApi';

function ProtocolBadge({ protocol }: { protocol: ExternalVMProtocol }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${externalVmProtocolBadgeClass(protocol)}`}
    >
      {protocol}
    </span>
  );
}

function SourceBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      External Server
    </span>
  );
}

function ScheduleCell({ row }: { row: MyVmDashboardRow }) {
  if (!row.assignments.length) {
    return <span className="text-gray-400">—</span>;
  }
  const schedules = row.assignments
    .filter((a) => a.schedule)
    .map((a) => {
      const s = a.schedule!;
      const days = s.daysOfWeek.length ? `${s.daysOfWeek.length}d/wk` : 'Daily';
      return `${days} ${s.dailyStart}–${s.dailyEnd}`;
    });
  if (!schedules.length) return <span className="text-gray-400">No schedule</span>;
  return (
    <span className="text-sm text-gray-700">{schedules[0]}{schedules.length > 1 ? ` +${schedules.length - 1}` : ''}</span>
  );
}

function StatusBadge({ row }: { row: MyVmDashboardRow }) {
  const schedule = row.accessSchedule;
  if (schedule?.override) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        Override active
      </span>
    );
  }
  const hasDateBound = schedule?.startDate || schedule?.endDate;
  if (hasDateBound || schedule?.weeklySchedule?.length) {
    return (
      <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
        Scheduled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
      Active
    </span>
  );
}

export default function MyVmDashboardPage() {
  const { isAuthenticated } = useAuth();
  const { rows, loading, error, refetch } = useAdminMyVmDashboard(isAuthenticated);

  return (
    <div className="max-w-screen-xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My VM Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Loading…' : `${rows.length} external server${rows.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <Server className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No external servers found.</p>
          <p className="mt-1 text-xs text-gray-400">
            Servers imported via Server Import will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">VM</th>
                  <th className="px-4 py-3">Protocol</th>
                  <th className="px-4 py-3">Assignee(s)</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source / Type</th>
                  <th className="px-4 py-3">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row._id} className="transition hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-400">{row.ipAddress}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ProtocolBadge protocol={row.protocol} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.assignments.length
                        ? formatAssignmentHolders(row.assignments).labels.join(', ')
                        : <span className="text-gray-400">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3">
                      <ScheduleCell row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge />
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-400 tracking-widest">
                      ••••••••
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
