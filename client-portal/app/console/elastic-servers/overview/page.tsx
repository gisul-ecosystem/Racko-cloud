'use client';

import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { useExternalVMs } from '../../../../hooks/useExternalVMs';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { Server, MonitorCheck, Terminal, Plus } from 'lucide-react';
import type { ExternalVMProtocol, IExternalVM } from '../../../../lib/externalVmApi';
import { externalVmProtocolBadgeClass } from '../../../../lib/externalVmApi';

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
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${externalVmProtocolBadgeClass(protocol)}`}
    >
      {protocol}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'red' | 'blue' | 'green';
}) {
  const toneClass = {
    red: 'bg-red-50 text-[#B91C1C]',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
  }[tone];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function ElasticServersOverviewPage() {
  const { isAuthenticated } = useAuth();
  const { vms, loading, error, refetch } = useExternalVMs(isAuthenticated);

  const total = vms.length;
  const rdpCount = vms.filter((vm) => vm.protocol === 'rdp').length;
  const sshCount = vms.filter((vm) => vm.protocol === 'ssh').length;

  const recent: IExternalVM[] = [...vms]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="max-w-screen-xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="mt-0.5 text-sm text-gray-500">Your external servers at a glance</p>
        </div>
        <Link
          href="/console/elastic-servers/add"
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717]"
        >
          <Plus className="h-4 w-4" />
          Add Server
        </Link>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {!error && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total Servers"
              value={total}
              icon={<Server className="h-6 w-6" />}
              tone="red"
            />
            <StatCard
              label="RDP"
              value={rdpCount}
              icon={<MonitorCheck className="h-6 w-6" />}
              tone="blue"
            />
            <StatCard
              label="SSH"
              value={sshCount}
              icon={<Terminal className="h-6 w-6" />}
              tone="green"
            />
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Recent servers</h2>
              <Link
                href="/console/elastic-servers"
                className="text-xs font-medium text-[#B91C1C] hover:text-[#DC2626]"
              >
                View all
              </Link>
            </div>

            {loading ? (
              <TableSkeleton rows={5} cols={4} embedded />
            ) : recent.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <Server className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-500">No external servers yet</p>
                <p className="mt-1 text-xs text-gray-400">Add a server to get started.</p>
              </div>
            ) : (
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
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                              <Server className="h-4 w-4" />
                            </span>
                            <span className="font-medium text-gray-900">{vm.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-gray-600">
                          {vm.ipAddress}
                        </td>
                        <td className="px-4 py-3.5">
                          <ProtocolBadge protocol={vm.protocol} />
                        </td>
                        <td className="px-4 py-3.5 text-gray-500">{formatDateTime(vm.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
