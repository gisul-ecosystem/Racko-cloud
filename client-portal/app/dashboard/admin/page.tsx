'use client';

import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { useMyVMs } from '../../../hooks/useVMs';
import { Server, Plus, Activity, HardDrive, Cpu, MemoryStick } from 'lucide-react';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { VMStatusBadge } from '../../../components/dashboard/VMStatusBadge';
import type { IVM } from '../../../lib/vmApi';

function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: 'blue' | 'green' | 'purple' | 'orange' | 'gray';
}) {
  const map = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-600' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600' },
    gray:   { bg: 'bg-gray-100',  icon: 'text-gray-500' },
  };
  const a = map[accent];
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <div className={`w-8 h-8 rounded-lg ${a.bg} flex items-center justify-center`}>
          <span className={a.icon}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const { vms, loading } = useMyVMs(isAuthenticated);

  if (!user) return null;

  const running = vms.filter((v) => v.status === 'running').length;
  const stopped = vms.filter((v) => v.status === 'stopped').length;
  const totalCpu = vms.reduce((s, v) => s + v.allocatedCpu, 0);
  const totalRam = vms.reduce((s, v) => s + v.allocatedMemoryGb, 0);
  const totalDisk = vms.reduce((s, v) => s + v.allocatedDiskGb, 0);
  const recentVMs = [...vms].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 5);

  return (
    <div className="max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Welcome back, {user.email}</p>
        </div>
        <Link
          href="/dashboard/admin/vms/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create VM
        </Link>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm animate-pulse">
              <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
              <div className="h-7 w-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total VMs" value={vms.length} sub={`${running} running · ${stopped} stopped`} icon={<Server className="w-4 h-4" />} accent="blue" />
          <StatCard label="Running" value={running} sub="Active VMs" icon={<Activity className="w-4 h-4" />} accent="green" />
          <StatCard label="Allocated CPU" value={`${totalCpu} vCPU`} sub={`Across ${vms.length} VMs`} icon={<Cpu className="w-4 h-4" />} accent="purple" />
          <StatCard label="Allocated RAM" value={`${totalRam.toFixed(1)} GB`} sub={`${totalDisk} GB disk`} icon={<MemoryStick className="w-4 h-4" />} accent="orange" />
        </div>
      )}

      {/* Recent VMs */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Recent VMs</h2>
            <p className="text-xs text-gray-400 mt-0.5">Your 5 most recently created VMs</p>
          </div>
          <Link
            href="/dashboard/admin/vms"
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : recentVMs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Server className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm font-medium">No VMs yet</p>
            <p className="text-gray-400 text-xs mt-1">Create your first VM to get started</p>
            <Link
              href="/dashboard/admin/vms/create"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Create VM
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Node</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Specs</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentVMs.map((vm: IVM, i) => (
                  <tr key={vm._id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3.5">
                      <Link href={`/dashboard/admin/vms/${vm._id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                        {vm.name}
                      </Link>
                      <p className="text-xs text-gray-400 font-mono">#{vm.vmid}</p>
                    </td>
                    <td className="px-4 py-3.5"><VMStatusBadge status={vm.status} /></td>
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
