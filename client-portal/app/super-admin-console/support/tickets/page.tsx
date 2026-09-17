'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchAllTickets,
  fetchSupportQueue,
  reassignTicket,
  updateTicketStatus,
  type SupportQueueAgent,
  type SupportTicket,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type SupportTicketType,
} from '@/lib/supportApi';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ToastContainer, useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 50;

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

const selectClass =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

const STATUS_OPTIONS: Array<{ value: '' | SupportTicketStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'tenant_handling', label: 'Tenant handling' },
  { value: 'platform_assigned', label: 'Platform assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const TYPE_OPTIONS: Array<{ value: '' | SupportTicketType; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'support', label: 'Support' },
  { value: 'bug', label: 'Bug' },
  { value: 'vm_request', label: 'VM request' },
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

function PriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${priorityBadgeStyles[priority]}`}
    >
      {priority}
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

interface ReassignModalProps {
  ticket: SupportTicket;
  agents: SupportQueueAgent[];
  onClose: () => void;
  onSuccess: () => void;
}

function ReassignModal({ ticket, agents, onClose, onSuccess }: ReassignModalProps) {
  const [agentId, setAgentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!agentId) {
      setError('Select an agent to reassign this ticket.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await reassignTicket(ticket._id, agentId);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reassign ticket.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Reassign Ticket {ticket.ticketNumber}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Current assignee:{' '}
              <span className="font-medium text-gray-700">
                {ticket.platformAssigneeName || 'Unassigned'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-1 block text-sm font-medium text-gray-700">Assign to</label>
        <select
          className={selectClass + ' w-full'}
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          <option value="">Select agent…</option>
          {agents.map((agent) => (
            <option key={String(agent._id)} value={String(agent._id)}>
              {agent.name} ({agent.email})
            </option>
          ))}
        </select>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SupportAllTicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toasts, addToast, dismiss } = useToast();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [agents, setAgents] = useState<SupportQueueAgent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'' | SupportTicketStatus>('');
  const [typeFilter, setTypeFilter] = useState<'' | SupportTicketType>('');
  const [priorityFilter, setPriorityFilter] = useState<'' | SupportTicketPriority>('');
  const [assigneeFilter, setAssigneeFilter] = useState(
    () => searchParams.get('assigneeId') ?? ''
  );
  const [search, setSearch] = useState('');
  const [reassignTicketRow, setReassignTicketRow] = useState<SupportTicket | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const apiFilters = useMemo(
    () => ({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      ...(assigneeFilter ? { assigneeId: assigneeFilter } : {}),
    }),
    [statusFilter, typeFilter, priorityFilter, assigneeFilter]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const skip = (page - 1) * PAGE_SIZE;
    try {
      const [pageTickets, countTickets, queue] = await Promise.all([
        fetchAllTickets({ ...apiFilters, skip, limit: PAGE_SIZE }),
        fetchAllTickets({ ...apiFilters, skip: 0, limit: 200 }),
        fetchSupportQueue(),
      ]);
      setTickets(pageTickets);
      setTotalCount(countTickets.length);
      setAgents(queue.agents ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  }, [apiFilters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (ticket) =>
        ticket.ticketNumber.toLowerCase().includes(q) ||
        ticket.subject.toLowerCase().includes(q)
    );
  }, [tickets, search]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  const clearFilters = () => {
    setStatusFilter('');
    setTypeFilter('');
    setPriorityFilter('');
    setAssigneeFilter('');
    setSearch('');
    setPage(1);
  };

  const handleStatusChange = async (ticketId: string, status: SupportTicketStatus) => {
    setStatusUpdatingId(ticketId);
    try {
      await updateTicketStatus(ticketId, status);
      addToast('success', 'Ticket status updated.');
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to update status.');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  if (error && tickets.length === 0 && !loading) {
    return (
      <div className="mx-auto max-w-screen-xl">
        <ErrorState title="Failed to load tickets" message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {reassignTicketRow ? (
        <ReassignModal
          ticket={reassignTicketRow}
          agents={agents}
          onClose={() => setReassignTicketRow(null)}
          onSuccess={() => {
            addToast('success', `Ticket ${reassignTicketRow.ticketNumber} reassigned.`);
            void load();
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            All Tickets
            {!loading && totalCount > 0 ? (
              <span className="ml-2 text-lg font-medium text-gray-400">({totalCount})</span>
            ) : null}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            View and manage all support tickets across tenants.
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

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select
              className={selectClass + ' w-full'}
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
            <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
            <select
              className={selectClass + ' w-full'}
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as '' | SupportTicketType);
                setPage(1);
              }}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Priority</label>
            <select
              className={selectClass + ' w-full'}
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
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Assigned agent</label>
            <select
              className={selectClass + ' w-full'}
              value={assigneeFilter}
              onChange={(e) => {
                setAssigneeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All agents</option>
              {agents.map((agent) => (
                <option key={String(agent._id)} value={String(agent._id)}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] flex-[1.5]">
            <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className={inputClass + ' pl-9'}
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
        <TableSkeleton rows={8} cols={9} />
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-700">No tickets found</p>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or search query.</p>
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
                    'Assigned agent',
                    'Tenant',
                    'Created',
                    'Actions',
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
                        href={`/super-admin-console/support/tickets/${ticket._id}`}
                        className="font-medium text-[#B91C1C] hover:underline"
                      >
                        {ticket.ticketNumber}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3.5 text-gray-900">{ticket.subject}</td>
                    <td className="px-4 py-3.5 capitalize text-gray-600">
                      {ticket.type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3.5">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-4 py-3.5">
                      <select
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]/20"
                        value={ticket.status}
                        disabled={statusUpdatingId === ticket._id}
                        onChange={(e) =>
                          void handleStatusChange(
                            ticket._id,
                            e.target.value as SupportTicketStatus
                          )
                        }
                      >
                        {STATUS_OPTIONS.filter((opt) => opt.value !== '').map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3.5">
                      {ticket.platformAssigneeName ? (
                        <span className="text-gray-900">{ticket.platformAssigneeName}</span>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-500">
                      {tenantLabel(ticket.tenantId)}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {formatRelativeTime(ticket.createdAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Reassign"
                          onClick={() => setReassignTicketRow(ticket)}
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:border-[#B91C1C] hover:text-[#B91C1C]"
                        >
                          <UserRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="View ticket"
                          onClick={() =>
                            router.push(`/super-admin-console/support/tickets/${ticket._id}`)
                          }
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:border-[#B91C1C] hover:text-[#B91C1C]"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages || loading}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                >
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
