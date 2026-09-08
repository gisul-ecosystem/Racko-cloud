'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ChevronRight as BreadcrumbChevron,
  Eye,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchMyTickets,
  type SupportTicket,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type SupportTicketType,
} from '@/lib/supportApi';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';

const PAGE_SIZE = 50;

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

const selectClass =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

const STATUS_OPTIONS: Array<{ value: '' | SupportTicketStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'platform_assigned', label: 'Platform assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS: Array<{ value: '' | SupportTicketPriority; label: string }> = [
  { value: '', label: 'All priorities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

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

function PriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${priorityBadgeStyles[priority]}`}
    >
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeStyles[status]}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function formatRelativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function tenantLabel(tenantId?: string): string {
  if (!tenantId) return 'Direct';
  return String(tenantId).slice(-8);
}

export default function SupportAgentAllTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'' | SupportTicketStatus>('');
  const [priorityFilter, setPriorityFilter] = useState<'' | SupportTicketPriority>('');
  const [search, setSearch] = useState('');

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const skip = (page - 1) * PAGE_SIZE;
      try {
        const [pageTickets, countTickets] = await Promise.all([
          fetchMyTickets({
            ...(statusFilter ? { status: statusFilter } : {}),
            skip,
            limit: PAGE_SIZE,
          }),
          fetchMyTickets({
            ...(statusFilter ? { status: statusFilter } : {}),
            skip: 0,
            limit: 200,
          }),
        ]);
        setTickets(pageTickets);
        setTotalCount(countTickets.length);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load tickets.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, statusFilter]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTickets = useMemo(() => {
    let rows = tickets;
    if (priorityFilter) {
      rows = rows.filter((ticket) => ticket.priority === priorityFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (ticket) =>
          ticket.ticketNumber.toLowerCase().includes(q) ||
          ticket.subject.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [tickets, priorityFilter, search]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  const clearFilters = () => {
    setStatusFilter('');
    setPriorityFilter('');
    setSearch('');
    setPage(1);
  };

  if (error && tickets.length === 0 && !loading) {
    return (
      <div className="mx-auto max-w-screen-xl">
        <ErrorState title="Failed to load tickets" message={error} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        <Link href="/support-agent" className="hover:text-[#B91C1C] hover:underline">
          My Queue
        </Link>
        <BreadcrumbChevron className="h-4 w-4 text-gray-300" />
        <span className="font-medium text-gray-900">All My Tickets</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            All My Tickets
            {!loading && totalCount > 0 ? (
              <span className="ml-2 text-lg font-medium text-gray-400">({totalCount})</span>
            ) : null}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Your full ticket history.</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select
              className={`${selectClass} w-full`}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as '' | SupportTicketStatus);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Priority</label>
            <select
              className={`${selectClass} w-full`}
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value as '' | SupportTicketPriority);
                setPage(1);
              }}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] flex-[1.5]">
            <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Ticket # or subject…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Clear filters
          </button>
        </div>
      </div>

      {loading && tickets.length === 0 ? (
        <TableSkeleton rows={8} cols={8} />
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
            <Inbox className="h-6 w-6 text-[#B91C1C]" />
          </div>
          <p className="text-sm font-medium text-gray-900">No tickets assigned to you</p>
          <p className="mt-1 text-sm text-gray-500">
            Try adjusting your filters or search query.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
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
                    'Created',
                    'Action',
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr key={ticket._id} className="border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/support-agent/tickets/${ticket._id}`}
                        className="font-medium text-[#B91C1C] hover:underline"
                      >
                        {ticket.ticketNumber}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3.5 text-gray-900">{ticket.subject}</td>
                    <td className="px-4 py-3.5 capitalize text-gray-600">
                      {(ticket.type as SupportTicketType).replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3.5">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-500">
                      {tenantLabel(ticket.tenantId)}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {formatRelativeTime(ticket.createdAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        title="Open ticket"
                        onClick={() => router.push(`/support-agent/tickets/${ticket._id}`)}
                        className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:border-[#B91C1C] hover:text-[#B91C1C]"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                {rangeStart}–{rangeEnd} of {totalCount}
                {totalCount === 200 ? '+' : ''} tickets
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <span className="text-xs text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
