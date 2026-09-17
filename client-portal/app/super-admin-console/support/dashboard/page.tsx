'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchSupportQueue,
  fetchSupportTickets,
  type SupportQueueAgent,
  type SupportTicket,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from '@/lib/supportApi';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { StatCardSkeleton, TableSkeleton } from '@/components/dashboard/LoadingSkeleton';

function isToday(dateValue: string | undefined): boolean {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function DashboardStatCard({
  label,
  value,
  accentClass,
}: {
  label: string;
  value: number;
  accentClass: string;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 border-l-4 bg-white px-5 py-4 shadow-sm ${accentClass}`}
    >
      <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  );
}

const statusBadgeStyles: Record<SupportTicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  tenant_handling: 'bg-violet-100 text-violet-700',
  platform_assigned: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-orange-100 text-orange-800',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
};

const priorityBadgeStyles: Record<SupportTicketPriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeStyles[status]}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${priorityBadgeStyles[priority]}`}
    >
      {priority}
    </span>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function computeStats(tickets: SupportTicket[]) {
  return {
    open: tickets.filter((t) => t.status === 'open').length,
    tenantHandling: tickets.filter((t) => t.status === 'tenant_handling').length,
    platformAssigned: tickets.filter((t) => t.status === 'platform_assigned').length,
    inProgress: tickets.filter((t) => t.status === 'in_progress').length,
    resolvedToday: tickets.filter(
      (t) => t.status === 'resolved' && isToday(t.resolvedAt)
    ).length,
    total: tickets.length,
  };
}

function AgentWorkloadRow({
  agent,
  maxOpen,
}: {
  agent: SupportQueueAgent;
  maxOpen: number;
}) {
  const loadPct = maxOpen > 0 ? Math.round((agent.openTicketCount / maxOpen) * 100) : 0;

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/80">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{agent.name}</span>
          {agent.isNext ? (
            <span className="rounded-full bg-[#B91C1C] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Next up
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-5 py-3.5 text-sm text-gray-600">{agent.email}</td>
      <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{agent.openTicketCount}</td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#B91C1C] transition-all"
              style={{ width: `${loadPct}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs text-gray-500">{loadPct}%</span>
        </div>
      </td>
    </tr>
  );
}

export default function SupportDashboardPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [agents, setAgents] = useState<SupportQueueAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketRows, queue] = await Promise.all([
        fetchSupportTickets(200),
        fetchSupportQueue(),
      ]);
      setTickets(ticketRows);
      setAgents(queue.agents ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load support dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => computeStats(tickets), [tickets]);
  const recentTickets = useMemo(() => tickets.slice(0, 10), [tickets]);
  const maxOpen = useMemo(
    () => Math.max(0, ...agents.map((agent) => agent.openTicketCount)),
    [agents]
  );

  if (loading && tickets.length === 0 && agents.length === 0) {
    return (
      <div className="mx-auto max-w-screen-xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
        <TableSkeleton rows={4} cols={4} />
        <TableSkeleton rows={5} cols={7} />
      </div>
    );
  }

  if (error && tickets.length === 0) {
    return (
      <div className="mx-auto max-w-screen-xl">
        <ErrorState title="Failed to load dashboard" message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Live overview of tickets and agent distribution.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DashboardStatCard label="Total Open" value={stats.open} accentClass="border-l-blue-500" />
        <DashboardStatCard
          label="Tenant Handling"
          value={stats.tenantHandling}
          accentClass="border-l-violet-500"
        />
        <DashboardStatCard
          label="Platform Assigned"
          value={stats.platformAssigned}
          accentClass="border-l-amber-500"
        />
        <DashboardStatCard
          label="In Progress"
          value={stats.inProgress}
          accentClass="border-l-orange-500"
        />
        <DashboardStatCard
          label="Resolved Today"
          value={stats.resolvedToday}
          accentClass="border-l-green-500"
        />
        <DashboardStatCard
          label="Total All Time"
          value={stats.total}
          accentClass="border-l-gray-400"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Agent Workload</h2>
        </div>
        {agents.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-500">No active support agents found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Agent', 'Email', 'Open tickets', 'Load'].map((heading) => (
                    <th
                      key={heading}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <AgentWorkloadRow key={String(agent._id)} agent={agent} maxOpen={maxOpen} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Tickets</h2>
        </div>
        {recentTickets.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-500">No tickets yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {[
                    'Ticket #',
                    'Subject',
                    'Type',
                    'Priority',
                    'Status',
                    'Tenant',
                    'Created At',
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTickets.map((ticket) => (
                  <tr key={ticket._id} className="border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/super-admin-console/support/tickets/${ticket._id}`}
                        className="font-medium text-[#B91C1C] hover:underline"
                      >
                        {ticket.ticketNumber}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-5 py-3.5 text-gray-900">{ticket.subject}</td>
                    <td className="px-5 py-3.5 capitalize text-gray-600">
                      {ticket.type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-5 py-3.5">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-500">
                      {ticket.tenantId ? String(ticket.tenantId).slice(-8) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{formatDateTime(ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
