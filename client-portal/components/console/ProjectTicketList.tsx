'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { fetchProjectSupportTickets, type ProjectSupportTicketRow } from '@/lib/projectsApi';
import { fetchMyTenantTickets, type TenantSupportTicket } from '@/lib/tenantSupportApi';
import { getTenantFacingStatus } from '@/lib/tenantSupportLabels';

const statusBadgeStyles: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  tenant_handling: 'bg-violet-100 text-violet-700',
  platform_assigned: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-orange-100 text-orange-800',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
};

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type TicketRow = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  createdAt: string;
  assigneeName: string | null;
};

function toRowFromTenant(t: TenantSupportTicket): TicketRow {
  return {
    id: t._id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt,
    assigneeName: t.platformAssigneeName?.trim() || t.tenantAssigneeName?.trim() || null,
  };
}

function toRowFromOrg(t: ProjectSupportTicketRow): TicketRow {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt,
    assigneeName: t.platformAssigneeName,
  };
}

export interface ProjectTicketListProps {
  projectId: string;
  mode: 'tenant' | 'org';
  /** When omitted (org console), rows are read-only. */
  ticketHref?: (ticketId: string) => string;
  /** Tenant console only — affects status labels. */
  isTenantAdmin?: boolean;
}

export function ProjectTicketList({
  projectId,
  mode,
  ticketHref,
  isTenantAdmin = false,
}: ProjectTicketListProps) {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'tenant') {
        const tickets = await fetchMyTenantTickets({ projectId, limit: 100 });
        setRows(tickets.map(toRowFromTenant));
      } else {
        const tickets = await fetchProjectSupportTickets(projectId);
        setRows(tickets.map(toRowFromOrg));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tickets.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center rounded-xl border border-gray-200 bg-white py-16">
        <Loader2 className="h-7 w-7 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
        <Inbox className="h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-700">No support tickets yet</p>
        <p className="mt-1 text-xs text-gray-500">Tickets raised for this project will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-4 py-3 font-medium">Ticket</th>
            <th className="px-4 py-3 font-medium">Subject</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">Status</th>
            <th className="hidden px-4 py-3 font-medium lg:table-cell">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 transition hover:bg-gray-50/80">
              <td className="px-4 py-3">
                {ticketHref ? (
                  <Link
                    href={ticketHref(row.id)}
                    className="font-mono text-xs font-semibold text-[#B91C1C] hover:underline"
                  >
                    {row.ticketNumber}
                  </Link>
                ) : (
                  <span className="font-mono text-xs font-semibold text-gray-700">{row.ticketNumber}</span>
                )}
              </td>
              <td className="px-4 py-3">
                {ticketHref ? (
                  <Link
                    href={ticketHref(row.id)}
                    className="font-medium text-gray-900 hover:text-[#B91C1C]"
                  >
                    {row.subject}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-900">{row.subject}</span>
                )}
                <div className="mt-1 sm:hidden">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      statusBadgeStyles[row.status] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {mode === 'tenant'
                      ? getTenantFacingStatus(row.status, isTenantAdmin)
                      : row.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </td>
              <td className="hidden px-4 py-3 sm:table-cell">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                    statusBadgeStyles[row.status] ?? 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {mode === 'tenant'
                    ? getTenantFacingStatus(row.status, isTenantAdmin)
                    : row.status.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">
                {formatCreatedAt(row.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
