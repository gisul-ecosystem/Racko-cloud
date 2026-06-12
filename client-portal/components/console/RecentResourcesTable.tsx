'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw, Server } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMyVMs } from '../../hooks/useVMs';
import { TableSkeleton } from '../dashboard/LoadingSkeleton';
import { VMStatusBadge } from '../dashboard/VMStatusBadge';
import { useConsoleShell } from './ConsoleContext';
import type { IVM } from '../../lib/vmApi';

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

function sortByRecent(vms: IVM[]) {
  return [...vms].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function RecentResourcesTable() {
  const { isAuthenticated } = useAuth();
  const { searchQuery } = useConsoleShell();
  const { vms, loading, error, refetch } = useMyVMs(isAuthenticated);

  const query = searchQuery.trim().toLowerCase();
  const filtered = sortByRecent(
    query
      ? vms.filter(
          (vm) =>
            vm.name.toLowerCase().includes(query) ||
            vm.node.toLowerCase().includes(query) ||
            String(vm.vmid).includes(query)
        )
      : vms
  );

  const recent = filtered.slice(0, PAGE_SIZE);
  const total = filtered.length;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">Recent resources</h2>
      </div>

      {loading ? (
        <TableSkeleton rows={PAGE_SIZE} cols={5} embedded />
      ) : error ? (
        <div className="p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-900">Failed to load resources</p>
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
            <Server className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">
            {query ? 'No resources match your search' : 'No resources yet'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {query ? 'Try a different search term' : 'Open VPS to create and manage virtual machines'}
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
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Node
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Last modified
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
                        href={`/dashboard/admin/vms/${vm._id}`}
                        className="flex items-center gap-3 font-medium text-gray-900 hover:text-[#B91C1C]"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                          <Server className="h-4 w-4" />
                        </span>
                        <span className="truncate">{vm.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">Virtual Machine</td>
                    <td className="px-4 py-3.5 text-gray-600">{vm.node}</td>
                    <td className="px-4 py-3.5">
                      <VMStatusBadge status={vm.status} />
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">{formatDateTime(vm.updatedAt)}</td>
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
