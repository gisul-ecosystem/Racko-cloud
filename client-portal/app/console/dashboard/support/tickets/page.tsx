'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Inbox, Loader2, Plus, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import {
  fetchMyTenantTickets,
  type TenantSupportTicket,
  type TenantTicketPriority,
  type TenantTicketStatus,
  type TenantTicketType,
} from '@/lib/tenantSupportApi';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { hexToRgba, tenantAccentButton } from '@/lib/tenantAccentStyles';
import { getTenantFacingStatus } from '@/lib/tenantSupportLabels';

const PAGE_SIZE = 20;

type TabFilter = 'all' | 'open' | 'in_progress' | 'resolved';

const IN_PROGRESS_STATUSES: TenantTicketStatus[] = [
  'tenant_handling',
  'platform_assigned',
  'in_progress',
];

const TABS: Array<{ id: TabFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
];

const typeBadgeStyles: Record<TenantTicketType, string> = {
  support: 'bg-blue-50 text-blue-700 border-blue-200',
  bug: 'bg-red-50 text-red-700 border-red-200',
  vm_request: 'bg-violet-50 text-violet-700 border-violet-200',
};

const priorityBadgeStyles: Record<TenantTicketPriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-700',
};

const statusBadgeStyles: Record<TenantTicketStatus, string> = {
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

function TicketCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex justify-between">
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="h-5 w-16 rounded-full bg-gray-100" />
      </div>
      <div className="mt-3 h-5 w-3/4 rounded bg-gray-200" />
      <div className="mt-4 flex gap-2">
        <div className="h-5 w-16 rounded-full bg-gray-100" />
        <div className="h-5 w-14 rounded-full bg-gray-100" />
      </div>
    </div>
  );
}

function TicketListCard({
  ticket,
  accentColor,
  isTenantAdmin,
}: {
  ticket: TenantSupportTicket;
  accentColor: string;
  isTenantAdmin: boolean;
}) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-mono text-xs font-semibold text-gray-500">{ticket.ticketNumber}</p>
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${isTenantAdmin ? 'capitalize' : ''} ${statusBadgeStyles[ticket.status]}`}
        >
          {getTenantFacingStatus(ticket.status, isTenantAdmin)}
        </span>
      </div>

      <h2 className="mt-2 text-base font-semibold text-gray-900">{ticket.subject}</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${typeBadgeStyles[ticket.type]}`}
        >
          {ticket.type.replace(/_/g, ' ')}
        </span>
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${priorityBadgeStyles[ticket.priority]}`}
        >
          {ticket.priority}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-gray-500">{formatRelativeTime(ticket.createdAt)}</span>
        <Link
          href={tenantConsole.supportTicket(ticket._id)}
          className="rounded-lg border bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-gray-50"
          style={{ color: accentColor, borderColor: hexToRgba(accentColor, 0.35) }}
        >
          View
        </Link>
      </div>
    </article>
  );
}

export default function TenantSupportTicketsPage() {
  const { accentColor } = useTenantBranding();
  const { isTenantAdmin } = useTenantRbac();
  const [allTickets, setAllTickets] = useState<TenantSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const tickets = await fetchMyTenantTickets({ skip: 0, limit: 200 });
      setAllTickets(tickets);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tickets.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTickets = useMemo(() => {
    if (activeTab === 'all') return allTickets;
    if (activeTab === 'open') return allTickets.filter((t) => t.status === 'open');
    if (activeTab === 'resolved') {
      return allTickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
    }
    return allTickets.filter((t) => IN_PROGRESS_STATUSES.includes(t.status));
  }, [allTickets, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
  const pageTickets = filteredTickets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    setPage(1);
  };

  if (error && allTickets.length === 0 && !loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState title="Failed to load tickets" message={error} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isTenantAdmin ? 'Support Tickets' : 'My Support Tickets'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isTenantAdmin
              ? 'All support requests from your organization.'
              : 'Track requests submitted to our support team.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Link
            href={tenantConsole.supportNew}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            style={tenantAccentButton(accentColor)}
          >
            <Plus className="h-4 w-4" />
            New Request
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                isActive
                  ? 'text-white shadow-sm'
                  : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
              style={isActive ? tenantAccentButton(accentColor) : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading && allTickets.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <TicketCardSkeleton key={i} />
          ))}
        </div>
      ) : pageTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: hexToRgba(accentColor, 0.1), color: accentColor }}
          >
            <Inbox className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-gray-900">No tickets yet</p>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === 'all'
              ? 'Submit your first support request to get started.'
              : 'No tickets match this filter.'}
          </p>
          {activeTab === 'all' ? (
            <Link
              href={tenantConsole.supportNew}
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              style={tenantAccentButton(accentColor)}
            >
              Submit your first request
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {pageTickets.map((ticket) => (
              <TicketListCard
                key={ticket._id}
                ticket={ticket}
                accentColor={accentColor}
                isTenantAdmin={isTenantAdmin}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
