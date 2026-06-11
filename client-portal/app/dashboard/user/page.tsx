'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { fetchMyAssignedVMs, type IVM, type VMStatus } from '../../../lib/vmApi';
import { ApiError } from '../../../lib/apiClient';
import { VMStatusBadge } from '../../../components/dashboard/VMStatusBadge';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { Server, RefreshCw, ChevronRight } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'paused', label: 'Paused' },
  { value: 'error', label: 'Error' },
];

const selectClass =
  'text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]';

export default function UserDashboard() {
  const { user } = useAuth();
  const [vms, setVMs] = useState<IVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMyAssignedVMs();
      setVMs(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VMs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredVms = useMemo(
    () => (statusFilter ? vms.filter((vm) => vm.status === statusFilter) : vms),
    [vms, statusFilter]
  );

  const runningCount = useMemo(() => vms.filter((vm) => vm.status === 'running').length, [vms]);
  const stoppedCount = useMemo(() => vms.filter((vm) => vm.status === 'stopped').length, [vms]);

  if (!user) return null;

  return (
    <div className="max-w-screen-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My VMs</h1>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#B91C1C] bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition disabled:opacity-40"          >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {!loading && !error && vms.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
            {vms.length} total
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            {runningCount} running
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
            {stoppedCount} stopped
          </span>
        </div>
      )}

      {error && !loading && <ErrorState message={error} onRetry={() => void load()} />}

      {!error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm font-semibold text-gray-900">Virtual Machines</p>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={selectClass}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <TableSkeleton rows={4} cols={7} />
          ) : filteredVms.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <Server className="w-7 h-7 text-[#B91C1C]" />
              </div>
              <p className="text-gray-700 font-medium">
                {statusFilter ? 'No VMs match this filter' : 'No VMs assigned yet'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {statusFilter
                  ? 'Try a different status filter.'
                  : 'Your administrator will assign virtual machines to your account.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      VM
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      CPU
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      RAM
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Disk
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      IP
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVms.map((vm, i) => (
                    <tr
                      key={vm._id}
                      className={`border-b border-gray-50 transition-colors ${
                        i % 2 !== 0 ? 'bg-gray-50/40 hover:bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <Link href={`/dashboard/user/vms/${vm._id}`} className="block group">
                          <p className="font-medium text-gray-900 group-hover:text-[#B91C1C] transition-colors">
                            {vm.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            {vm.templateName && (
                              <p className="text-xs text-gray-400">{vm.templateName}</p>
                            )}
                            {vm.automationManaged && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                Scheduled lab
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <VMStatusBadge status={vm.status as VMStatus} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedCpu} vCPU</td>
                      <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedMemoryGb} GB</td>
                      <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedDiskGb} GB</td>
                      <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">
                        {vm.ipAddress ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/dashboard/user/vms/${vm._id}`}
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500 hover:text-[#B91C1C] transition-colors"
                        >
                          View
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
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
