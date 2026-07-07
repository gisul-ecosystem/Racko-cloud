'use client';

import { useState } from 'react';
import type { VMSummary } from '../../lib/proxmoxApi';

interface Props {
  vms: VMSummary[];
}

type StatusFilter = 'all' | VMSummary['status'];
type TypeFilter = 'all' | VMSummary['type'];

const statusColors: Record<VMSummary['status'], string> = {
  running:   'bg-green-100 text-green-700 border-green-200',
  stopped:   'bg-gray-100 text-gray-500 border-gray-200',
  paused:    'bg-yellow-100 text-yellow-700 border-yellow-200',
  suspended: 'bg-orange-100 text-orange-700 border-orange-200',
};

const statusDot: Record<VMSummary['status'], string> = {
  running:   'bg-green-500',
  stopped:   'bg-gray-400',
  paused:    'bg-yellow-500',
  suspended: 'bg-orange-500',
};

function StatusBadge({ status }: { status: VMSummary['status'] }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${statusColors[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${statusDot[status]}`} />
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: VMSummary['type'] }) {
  return (
    <span className={`text-xs font-mono font-medium px-1.5 py-0.5 rounded border ${
      type === 'qemu'
        ? 'bg-purple-50 text-purple-700 border-purple-200'
        : 'bg-teal-50 text-teal-700 border-teal-200'
    }`}>
      {type.toUpperCase()}
    </span>
  );
}

function UsageBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[70px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

export function VMsTable({ vms }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const filtered = vms.filter((vm) => {
    if (statusFilter !== 'all' && vm.status !== statusFilter) return false;
    if (typeFilter !== 'all' && vm.type !== typeFilter) return false;
    return true;
  });

  const selectClass = "text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Virtual Machines &amp; Containers</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} of {vms.length} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={selectClass}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="running">Running</option>
            <option value="stopped">Stopped</option>
            <option value="paused">Paused</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className={selectClass}
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="qemu">QEMU</option>
            <option value="lxc">LXC</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          No VMs match the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Node</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">CPU</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Memory</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Disk</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Network</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((vm, i) => (
                <tr
                  key={`${vm.node}-${vm.vmid}`}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}
                >
                  <td className="px-6 py-3.5 text-gray-400 text-xs font-mono">{vm.vmid}</td>
                  <td className="px-4 py-3.5 font-medium text-gray-900 whitespace-nowrap">{vm.name}</td>
                  <td className="px-4 py-3.5"><TypeBadge type={vm.type} /></td>
                  <td className="px-4 py-3.5"><StatusBadge status={vm.status} /></td>
                  <td className="px-4 py-3.5 text-gray-500 text-xs">{vm.node}</td>
                  <td className="px-4 py-3.5">
                    <div className="space-y-0.5">
                      <p className="text-xs text-gray-400">{vm.cpu.allocated} vCPU</p>
                      <UsageBar pct={vm.cpu.usagePercent} />
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="space-y-0.5">
                      <p className="text-xs text-gray-400">{vm.memory.used.toFixed(1)} / {vm.memory.allocated.toFixed(1)} GB</p>
                      <UsageBar pct={vm.memory.usagePercent} />
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                    {vm.disk.used.toFixed(1)} / {vm.disk.allocated.toFixed(1)} GB
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                    ↓ {vm.network.in.toFixed(1)} MB
                    <br />
                    ↑ {vm.network.out.toFixed(1)} MB
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                    {vm.status === 'running' ? vm.uptime.formatted : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
