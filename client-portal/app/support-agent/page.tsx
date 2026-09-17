'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchMyTickets,
  supportTicketProjectId,
  supportTicketProjectLabel,
  uniqueTicketProjects,
  type SupportTicket,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type SupportTicketType,
} from '@/lib/supportApi';
import { ErrorState } from '@/components/dashboard/ErrorState';

const PAGE_SIZE = 20;

type TabFilter = '' | SupportTicketStatus;

const TABS: Array<{ id: TabFilter; label: string }> = [
  { id: '', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'platform_assigned', label: 'Platform Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
];

const typeBadgeStyles: Record<SupportTicketType, string> = {
  support: 'bg-blue-50 text-blue-700 border-blue-200',
  bug: 'bg-red-50 text-red-700 border-red-200',
  vm_request: 'bg-violet-50 text-violet-700 border-violet-200',
};

const priorityBadgeStyles: Record<SupportTicketPriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-700',
};

const statusBadgeStyles: Record<SupportTicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  tenant_handling: 'bg-violet-100 text-violet-700',
  platform_assigned: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-orange-100 text-orange-800',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
};

function formatRelativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function tenantLabel(tenantId?: string): string {
  if (!tenantId) return 'Direct';
  return tenantId.length > 8 ? tenantId.slice(-8) : tenantId;
}

function TicketCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="h-4 w-24 rounded bg-gray-200" />
      <div className="mt-3 h-5 w-full rounded bg-gray-200" />
      <div className="mt-4 flex gap-2">
        <div className="h-5 w-16 rounded-full bg-gray-100" />
        <div className="h-5 w-16 rounded-full bg-gray-100" />
      </div>
      <div className="mt-4 h-4 w-32 rounded bg-gray-100" />
    </div>
  );
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  return (
    <article className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#B91C1C]">
            {ticket.ticketNumber}
          </p>
          <h2 className="mt-1 text-base font-semibold text-gray-900">{ticket.subject}</h2>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeStyles[ticket.status]}`}
        >
          {ticket.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${typeBadgeStyles[ticket.type]}`}
        >
          {ticket.type.replace(/_/g, ' ')}
        </span>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${priorityBadgeStyles[ticket.priority]}`}
        >
          {ticket.priority}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
        <span>
          Tenant: <span className="font-mono text-gray-700">{tenantLabel(ticket.tenantId)}</span>
        </span>
        {supportTicketProjectLabel(ticket.projectId) ? (
          <span className="text-xs text-gray-500">
            Project: {supportTicketProjectLabel(ticket.projectId)}
          </span>
        ) : null}
        <span>{formatRelativeTime(ticket.createdAt)}</span>
      </div>

      <Link
        href={`/support-agent/tickets/${ticket._id}`}
        className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] sm:w-auto"
      >
        Open Ticket
      </Link>
    </article>
  );
}

export default function SupportAgentQueuePage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('');
  const [projectFilter, setProjectFilter] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const skip = (page - 1) * PAGE_SIZE;
      try {
        const rows = await fetchMyTickets({
          ...(activeTab ? { status: activeTab } : {}),
          skip,
          limit: PAGE_SIZE + 1,
        });
        setHasMore(rows.length > PAGE_SIZE);
        setTickets(rows.slice(0, PAGE_SIZE));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load your tickets.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, page]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    setPage(1);
  };

  const agentProjects = useMemo(() => uniqueTicketProjects(tickets), [tickets]);

  const filteredTickets = useMemo(() => {
    if (!projectFilter) return tickets;
    return tickets.filter(
      (ticket) => supportTicketProjectId(ticket.projectId) === projectFilter
    );
  }, [tickets, projectFilter]);

  const emptyMessage = useMemo(() => {
    if (projectFilter) return 'No tickets for this project';
    if (activeTab === '') return 'No tickets assigned to you';
    const tabLabel = TABS.find((t) => t.id === activeTab)?.label ?? 'matching';
    return `No ${tabLabel.toLowerCase()} tickets assigned to you`;
  }, [activeTab, projectFilter]);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Queue</h1>
          <p className="mt-1 text-sm text-gray-500">Tickets assigned to you.</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[#B91C1C] hover:text-[#B91C1C] disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id || 'all'}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-[#B91C1C] text-white shadow-sm'
                    : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <select
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
        >
          <option value="">All Projects</option>
          {agentProjects.map((project) => (
            <option key={project._id} value={project._id}>
              {project.clientName || project.name}
            </option>
          ))}
        </select>
      </div>

      {loading && tickets.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <TicketCardSkeleton key={i} />
          ))}
        </div>
      ) : error && tickets.length === 0 ? (
        <ErrorState title="Failed to load queue" message={error} onRetry={() => void load()} />
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
            <Inbox className="h-6 w-6 text-[#B91C1C]" />
          </div>
          <p className="text-sm font-medium text-gray-900">{emptyMessage}</p>
        </div>
      ) : (
        <>
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredTickets.map((ticket) => (
              <TicketCard key={ticket._id} ticket={ticket} />
            ))}
          </div>

          {(page > 1 || hasMore) && (
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="text-sm text-gray-500">Page {page}</span>
              <button
                type="button"
                disabled={!hasMore || loading}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
