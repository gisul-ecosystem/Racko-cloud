'use client';

import Link from 'next/link';
import { AlertTriangle, Globe, RefreshCw, Server } from 'lucide-react';
import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMyVMs } from '../../hooks/useVMs';
import { useExternalVMs } from '../../hooks/useExternalVMs';
import { TableSkeleton } from '../dashboard/LoadingSkeleton';
import { VMStatusBadge } from '../dashboard/VMStatusBadge';
import { useConsoleShell } from './ConsoleContext';
import type { ExternalVMProtocol } from '../../lib/externalVmApi';
import type { VMStatus } from '../../lib/vmApi';

const PAGE_SIZE = 6;

type RecentResourceKind = 'vps' | 'elastic';

interface RecentResource {
  id: string;
  kind: RecentResourceKind;
  name: string;
  serviceLabel: string;
  detail: string;
  lastActivityAt: string;
  href: string;
  vpsStatus?: VMStatus;
  elasticProtocol?: ExternalVMProtocol;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ProtocolBadge({ protocol }: { protocol: ExternalVMProtocol }) {
  const styles =
    protocol === 'rdp'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-green-50 text-green-700 border-green-200';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${styles}`}
    >
      {protocol}
    </span>
  );
}

function ResourceIcon({ kind }: { kind: RecentResourceKind }) {
  const Icon = kind === 'vps' ? Server : Globe;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function RecentResourcesTable() {
  const { isAuthenticated } = useAuth();
  const { searchQuery } = useConsoleShell();
  const { vms, loading: vpsLoading, error: vpsError, refetch: refetchVps } = useMyVMs(isAuthenticated);
  const {
    vms: externalVms,
    loading: elasticLoading,
    error: elasticError,
    refetch: refetchElastic,
  } = useExternalVMs(isAuthenticated);

  const loading = vpsLoading || elasticLoading;
  const query = searchQuery.trim().toLowerCase();

  const { recent, total } = useMemo(() => {
    const unified: RecentResource[] = [
      ...vms.map((vm) => ({
        id: `vps-${vm._id}`,
        kind: 'vps' as const,
        name: vm.name,
        serviceLabel: 'VPS Hosting',
        detail: vm.node,
        lastActivityAt: vm.updatedAt,
        href: `/dashboard/admin/vms/${vm._id}`,
        vpsStatus: vm.status,
      })),
      ...externalVms.map((vm) => ({
        id: `elastic-${vm._id}`,
        kind: 'elastic' as const,
        name: vm.name,
        serviceLabel: 'Elastic Server',
        detail: vm.ipAddress,
        lastActivityAt: vm.updatedAt || vm.createdAt,
        href: `/console/elastic-servers/${vm._id}/console`,
        elasticProtocol: vm.protocol,
      })),
    ];

    const filtered = query
      ? unified.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.serviceLabel.toLowerCase().includes(query) ||
            item.detail.toLowerCase().includes(query)
        )
      : unified;

    const sorted = [...filtered].sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    return { recent: sorted.slice(0, PAGE_SIZE), total: sorted.length };
  }, [vms, externalVms, query]);

  const refetch = () => {
    void refetchVps();
    void refetchElastic();
  };

  const bothFailed = Boolean(vpsError && elasticError) && recent.length === 0;
  const partialError = Boolean(vpsError || elasticError) && recent.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">Recent resources</h2>
      </div>

      {loading ? (
        <TableSkeleton rows={PAGE_SIZE} cols={5} embedded />
      ) : bothFailed ? (
        <div className="p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-900">Failed to load resources</p>
          <p className="mt-1 text-xs text-gray-500">{vpsError || elasticError}</p>
          <button
            type="button"
            onClick={refetch}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : recent.length === 0 ? (
        <div className="p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Server className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">
            {query ? 'No resources match your search' : 'No resources yet'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {query
              ? 'Try a different search term'
              : 'Open a service above to create or connect resources'}
          </p>
        </div>
      ) : (
        <>
          {partialError && (
            <div className="border-b border-amber-100 bg-amber-50 px-6 py-3 text-xs text-amber-800">
              Some resources could not be loaded. Showing available results.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Service
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Detail
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Last activity
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                      index % 2 !== 0 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 font-medium text-gray-900 hover:text-[#B91C1C]"
                      >
                        <ResourceIcon kind={item.kind} />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{item.serviceLabel}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-600">{item.detail}</td>
                    <td className="px-4 py-3.5">
                      {item.kind === 'vps' && item.vpsStatus ? (
                        <VMStatusBadge status={item.vpsStatus} />
                      ) : item.elasticProtocol ? (
                        <ProtocolBadge protocol={item.elasticProtocol} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {formatDateTime(item.lastActivityAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-100 px-6 py-4 text-sm text-gray-500">
            <p>
              Showing 1 to {recent.length} of {total} record{total === 1 ? '' : 's'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
