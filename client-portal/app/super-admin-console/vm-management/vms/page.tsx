'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { useAllVMsAdmin } from '../../../../hooks/useVMs';
import { VMStatusBadge, CloneTypeBadge } from '../../../../components/dashboard/VMStatusBadge';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { RefreshCw, MonitorCheck } from 'lucide-react';
import type { VMStatus, CloneType } from '../../../../lib/vmApi';

const selectClass =
  'text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function SuperAdminVMsPage() {
  const searchParams = useSearchParams();
  const adminIdFilter = searchParams.get('adminId') ?? '';
  const adminEmail = searchParams.get('email') ?? '';
  const { isAuthenticated } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [cloneFilter, setCloneFilter] = useState('');
  const [knownNodes, setKnownNodes] = useState<string[]>([]);

  const { vms, loading, error, refetch } = useAllVMsAdmin(isAuthenticated, {
    status: statusFilter || undefined,
    node: nodeFilter || undefined,
    cloneType: cloneFilter || undefined,
  });

  const displayedVms = useMemo(
    () => (adminIdFilter ? vms.filter((v) => v.adminId === adminIdFilter) : vms),
    [vms, adminIdFilter]
  );

  useEffect(() => {
    if (vms.length > 0) {
      setKnownNodes((prev) => {
        const merged = [...new Set([...prev, ...vms.map((v) => v.node)])].sort();
        return merged;
      });
    }
  }, [vms]);

  return (
    <div className="max-w-screen-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {adminIdFilter ? 'Customer VMs' : 'All VMs'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading
              ? 'Loading…'
              : adminIdFilter
                ? `${displayedVms.length} VMs for ${adminEmail || adminIdFilter}`
                : `${displayedVms.length} VMs across all admins`}
          </p>
          {adminIdFilter ? (
            <Link
              href="/super-admin-console/vm-management/vms"
              className="mt-1 inline-block text-xs font-medium text-[#B91C1C] hover:underline"
            >
              Clear customer filter
            </Link>
          ) : null}
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {!error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm font-semibold text-gray-900">Virtual Machines</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass} aria-label="Filter by status">
                <option value="">All statuses</option>
                {['running','stopped','paused','suspended','error','creating','deleting'].map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} className={selectClass} aria-label="Filter by node">
                <option value="">All nodes</option>
                {knownNodes.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={cloneFilter} onChange={(e) => setCloneFilter(e.target.value)} className={selectClass} aria-label="Filter by clone type">
                <option value="">All types</option>
                <option value="dedicated_storage">Dedicated</option>
                <option value="dynamic_storage">Dynamic</option>
              </select>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : displayedVms.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <MonitorCheck className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm">No VMs match the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['VM', 'Status', 'Type', 'Node', 'Admin', 'CPU', 'RAM', 'Disk', 'IP', 'Created'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide first:px-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedVms.map((vm, i) => (
                    <tr key={vm._id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-gray-900">{vm.name}</p>
                        <p className="text-xs text-gray-400 font-mono">#{vm.vmid}</p>
                      </td>
                      <td className="px-4 py-3.5"><VMStatusBadge status={vm.status as VMStatus} /></td>
                      <td className="px-4 py-3.5"><CloneTypeBadge type={vm.cloneType as CloneType} /></td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{vm.node}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-400 font-mono truncate max-w-[120px]">{vm.adminId}</td>
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
