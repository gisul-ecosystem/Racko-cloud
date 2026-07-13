'use client';

import Link from 'next/link';
import { Activity, Cpu, MemoryStick, Plus, Server } from 'lucide-react';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { VMStatusBadge } from '@/components/dashboard/VMStatusBadge';
import type { VMStatus } from '@/lib/vmApi';

export interface VpsOverviewVmRow {
  id: string;
  name: string;
  vmid: number;
  status: VMStatus | string;
  node: string;
  allocatedCpu: number;
  allocatedMemoryGb: number;
  allocatedDiskGb: number;
  createdAt: string;
}

export interface VpsOverviewDashboardProps {
  email: string;
  vms: VpsOverviewVmRow[];
  loading: boolean;
  /** Path for Create VM CTA */
  createHref: string;
  /** Path for View all VMs */
  vmsListHref: string;
  /** Path prefix for VM detail links: `${vmDetailHrefPrefix}/${id}` */
  vmDetailHrefPrefix: string;
  /** Optional primary button style (tenant branding). Defaults to admin blue. */
  createButtonClassName?: string;
  createButtonStyle?: React.CSSProperties;
  showCreateButton?: boolean;
}

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: 'blue' | 'green' | 'purple' | 'orange' | 'gray';
}) {
  const map = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600' },
    green: { bg: 'bg-green-50', icon: 'text-green-600' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600' },
    gray: { bg: 'bg-gray-100', icon: 'text-gray-500' },
  };
  const a = map[accent];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.bg}`}>
          <span className={a.icon}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-400">{sub}</p> : null}
    </div>
  );
}

/**
 * Shared VPS Overview dashboard used by admin `/dashboard/admin`
 * and tenant `/tenant/dashboard/overview` — same UI, different data source.
 */
export function VpsOverviewDashboard({
  email,
  vms,
  loading,
  createHref,
  vmsListHref,
  vmDetailHrefPrefix,
  createButtonClassName = 'bg-blue-600 hover:bg-blue-700 text-white',
  createButtonStyle,
  showCreateButton = true,
}: VpsOverviewDashboardProps) {
  const running = vms.filter((v) => v.status === 'running').length;
  const stopped = vms.filter((v) => v.status === 'stopped').length;
  const totalCpu = vms.reduce((s, v) => s + v.allocatedCpu, 0);
  const totalRam = vms.reduce((s, v) => s + v.allocatedMemoryGb, 0);
  const totalDisk = vms.reduce((s, v) => s + v.allocatedDiskGb, 0);

  const recentVMs = [...vms]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="max-w-screen-xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">Welcome back, {email}</p>
        </div>
        {showCreateButton ? (
          <Link
            href={createHref}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition ${createButtonClassName}`}
            style={createButtonStyle}
          >
            <Plus className="h-4 w-4" />
            Create VM
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-3 h-3 w-20 rounded bg-gray-200" />
              <div className="h-7 w-12 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Total VMs"
            value={vms.length}
            sub={`${running} running · ${stopped} stopped`}
            icon={<Server className="h-4 w-4" />}
            accent="blue"
          />
          <StatCard
            label="Running"
            value={running}
            sub="Active VMs"
            icon={<Activity className="h-4 w-4" />}
            accent="green"
          />
          <StatCard
            label="Allocated CPU"
            value={`${totalCpu} vCPU`}
            sub={`Across ${vms.length} VMs`}
            icon={<Cpu className="h-4 w-4" />}
            accent="purple"
          />
          <StatCard
            label="Allocated RAM"
            value={`${totalRam.toFixed(1)} GB`}
            sub={`${totalDisk} GB disk`}
            icon={<MemoryStick className="h-4 w-4" />}
            accent="orange"
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Recent VMs</h2>
            <p className="mt-0.5 text-xs text-gray-400">Your 5 most recently created VMs</p>
          </div>
          <Link
            href={vmsListHref}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : recentVMs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Server className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">No VMs yet</p>
            <p className="mt-1 text-xs text-gray-400">Create your first VM to get started</p>
            {showCreateButton ? (
              <Link
                href={createHref}
                className={`mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${createButtonClassName}`}
                style={createButtonStyle}
              >
                <Plus className="h-4 w-4" />
                Create VM
              </Link>
            ) : null}
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
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Node
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Specs
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentVMs.map((vm, i) => (
                  <tr
                    key={vm.id}
                    className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                      i % 2 !== 0 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      <Link
                        href={`${vmDetailHrefPrefix}/${vm.id}`}
                        className="font-medium text-gray-900 transition-colors hover:text-blue-600"
                      >
                        {vm.name}
                      </Link>
                      <p className="font-mono text-xs text-gray-400">#{vm.vmid}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <VMStatusBadge status={vm.status as VMStatus} />
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-500">{vm.node}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-500">
                      {vm.allocatedCpu} vCPU · {vm.allocatedMemoryGb} GB RAM
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">
                      {new Date(vm.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
