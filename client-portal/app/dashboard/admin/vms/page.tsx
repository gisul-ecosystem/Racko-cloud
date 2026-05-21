'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { useMyVMs } from '../../../../hooks/useVMs';
import { VMStatusBadge, CloneTypeBadge } from '../../../../components/dashboard/VMStatusBadge';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { Server, Plus, RefreshCw } from 'lucide-react';
import type { VMStatus, CloneType } from '../../../../lib/vmApi';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'paused', label: 'Paused' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'error', label: 'Error' },
];

const CLONE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'dedicated_storage', label: 'Dedicated' },
  { value: 'dynamic_storage', label: 'Dynamic' },
];

const selectClass =
  'text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function VMListPage() {
  const { isAuthenticated } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [cloneFilter, setCloneFilter] = useState('');

  const { vms, loading, error, refetch } = useMyVMs(isAuthenticated, {
    status: statusFilter || undefined,
    cloneType: cloneFilter || undefined,
  });

  return (
    <div className="max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My VMs</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Loading…' : `${vms.length} VM${vms.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/dashboard/admin/vms/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create VM
          </Link>
        </div>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {!error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm font-semibold text-gray-900">Virtual Machines</p>
            <div className="flex items-center gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass} aria-label="Filter by status">
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={cloneFilter} onChange={(e) => setCloneFilter(e.target.value)} className={selectClass} aria-label="Filter by clone type">
                {CLONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : vms.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Server className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">No VMs found</p>
              <p className="text-gray-400 text-sm mt-1">
                {statusFilter || cloneFilter ? 'Try adjusting your filters.' : 'Create your first VM to get started.'}
              </p>
              {!statusFilter && !cloneFilter && (
                <Link
                  href="/dashboard/admin/vms/create"
                  className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                >
                  <Plus className="w-4 h-4" />
                  Create VM
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">VM</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Node</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">CPU</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">RAM</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Disk</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm, i) => (
                    <tr
                      key={vm._id}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}
                    >
                      <td className="px-6 py-3.5">
                        <Link href={`/dashboard/admin/vms/${vm._id}`} className="block">
                          <p className="font-medium text-gray-900 hover:text-blue-600 transition-colors">{vm.name}</p>
                          <p className="text-xs text-gray-400 font-mono">#{vm.vmid} · {vm.templateName}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5"><VMStatusBadge status={vm.status as VMStatus} /></td>
                      <td className="px-4 py-3.5"><CloneTypeBadge type={vm.cloneType as CloneType} /></td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{vm.node}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedCpu} vCPU</td>
                      <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedMemoryGb} GB</td>
                      <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedDiskGb} GB</td>
                      <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">{vm.ipAddress ?? '—'}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">{new Date(vm.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
