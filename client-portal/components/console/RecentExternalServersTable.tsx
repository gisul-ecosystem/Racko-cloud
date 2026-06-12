'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useExternalVMs } from '../../hooks/useExternalVMs';
import { TableSkeleton } from '../dashboard/LoadingSkeleton';
import { useConsoleShell } from './ConsoleContext';
import type { IExternalVM, ExternalVMProtocol } from '../../lib/externalVmApi';

const PAGE_SIZE = 5;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sortByRecent(vms: IExternalVM[]) {
  return [...vms].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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

export function RecentExternalServersTable() {
  const { isAuthenticated } = useAuth();
  const { searchQuery } = useConsoleShell();
  const { vms, loading, error, refetch } = useExternalVMs(isAuthenticated);

  const query = searchQuery.trim().toLowerCase();
  const filtered = sortByRecent(
    query
      ? vms.filter(
          (vm) =>
            vm.name.toLowerCase().includes(query) ||
            vm.ipAddress.toLowerCase().includes(query) ||
            vm.protocol.toLowerCase().includes(query) ||
            vm.vmType.toLowerCase().includes(query)
        )
      : vms
  );

  const recent = filtered.slice(0, PAGE_SIZE);
  const total = filtered.length;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">Elastic Servers</h2>
        <Link
          href="/console/elastic-servers"
          className="text-xs font-medium text-[#B91C1C] hover:text-[#DC2626]"
        >
          View all
        </Link>
      </div>

      {loading ? (
        <TableSkeleton rows={PAGE_SIZE} cols={5} embedded />
      ) : error ? (
        <div className="p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-900">Failed to load external servers</p>
          <p className="mt-1 text-xs text-gray-500">{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : recent.length === 0 ? (
        <div className="p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Globe className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">
            {query ? 'No external servers match your search' : 'No external servers yet'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {query
              ? 'Try a different search term'
              : 'Open Elastic Server Import to connect external servers'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    IP Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Protocol
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    VM Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Added
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((vm, index) => (
                  <tr
                    key={vm._id}
                    className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                      index % 2 !== 0 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      <Link
                        href="/console/elastic-servers"
                        className="flex items-center gap-3 font-medium text-gray-900 hover:text-[#B91C1C]"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                          <Globe className="h-4 w-4" />
                        </span>
                        <span className="truncate">{vm.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-600">{vm.ipAddress}</td>
                    <td className="px-4 py-3.5">
                      <ProtocolBadge protocol={vm.protocol} />
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{vm.vmType}</td>
                    <td className="px-4 py-3.5 text-gray-500">{formatDateTime(vm.createdAt)}</td>
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
