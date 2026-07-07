'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { useMyVMs } from '../../../../hooks/useVMs';
import { VMStatusBadge, CloneTypeBadge } from '../../../../components/dashboard/VMStatusBadge';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { bulkDeleteVMs, bulkStartVMs, bulkStopVMs, restrictVM } from '../../../../lib/vmApi';
import { ApiError } from '../../../../lib/apiClient';
import { Server, Plus, RefreshCw, Play, Square, Trash2, X, Download, Shield } from 'lucide-react';
import type { VMStatus, CloneType, IVM } from '../../../../lib/vmApi';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'paused', label: 'Paused' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'error', label: 'Error' },
];

const CLONE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'dedicated_storage', label: 'Dedicated' },
  { value: 'dynamic_storage', label: 'Dynamic' },
];

const selectClass =
  'text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500';

type BulkAction = 'start' | 'stop' | 'delete' | 'restrict';

export default function VMListPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [cloneFilter, setCloneFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { toasts, addToast, dismiss } = useToast();

  const { vms, loading, error, refetch } = useMyVMs(isAuthenticated, {
    status: statusFilter || undefined,
    cloneType: cloneFilter || undefined,
  });

  // Selection helpers — restricted VMs are never selectable
  const selectableVMs = vms.filter((v) => !v.isRestricted);
  const allSelected = selectableVMs.length > 0 && selected.size === selectableVMs.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableVMs.map((v) => v._id)));
    }
  }, [allSelected, selectableVMs]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Set());

  // Export VM credentials to CSV (opens as Excel-compatible download)
  const exportCredentials = useCallback(() => {
    if (vms.length === 0) return;
    const headers = ['VM Name', 'IP Address', 'Username', 'Password', 'Status', 'Node'];
    const rows = vms.map((vm) => [
      vm.name,
      vm.ipAddress ?? '',
      vm.consoleUsername ?? '',
      vm.consolePassword ?? '',
      vm.status,
      vm.node,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vm-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [vms]);

  // Derive what actions are valid for current selection
  const selectedVMs = vms.filter((v) => selected.has(v._id));
  const allStopped = selectedVMs.every((v) => v.status === 'stopped');
  const allRunning = selectedVMs.every((v) => v.status === 'running');

  // Execute bulk action
  const executeBulkAction = async (action: BulkAction) => {
    setActionLoading(true);

    try {
      if (action === 'restrict') {
        const results = await Promise.allSettled(
          selectedVMs.map((vm) => restrictVM(vm._id))
        );
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed === 0) {
          addToast('success', `${succeeded} VM${succeeded !== 1 ? 's' : ''} restricted successfully.`);
        } else {
          addToast('error' as 'error', `${succeeded} restricted, ${failed} failed.`);
        }
        clearSelection();
        refetch();
        return;
      }

      if (action === 'delete') {
        const result = await bulkDeleteVMs(selectedVMs.map((vm) => vm._id));
        const skippedMsg = result.restrictedSkipped > 0
          ? ` (${result.restrictedSkipped} restricted VM${result.restrictedSkipped !== 1 ? 's' : ''} skipped)`
          : '';
        addToast(
          'success',
          `Delete job started for ${selectedVMs.length - result.restrictedSkipped} VM${selectedVMs.length - result.restrictedSkipped !== 1 ? 's' : ''}.${skippedMsg} Track progress on the Jobs page.`
        );
        clearSelection();
        refetch();
        router.push(`/dashboard/admin/jobs/${result.jobId}`);
        return;
      }

      // Bulk start/stop — single server-side request, no token race
      const result = action === 'start'
        ? await bulkStartVMs(selectedVMs.map((vm) => vm._id))
        : await bulkStopVMs(selectedVMs.map((vm) => vm._id));

      const skippedMsg = result.restrictedSkipped > 0
        ? ` (${result.restrictedSkipped} restricted skipped)`
        : '';

      if (result.failed === 0) {
        addToast('success', `${result.succeeded} VM${result.succeeded !== 1 ? 's' : ''} ${action === 'start' ? 'started' : 'stopped'} successfully.${skippedMsg}`);
      } else if (result.succeeded === 0) {
        addToast('error', `Failed to ${action} all ${result.failed} VM${result.failed !== 1 ? 's' : ''}.`);
      } else {
        addToast('warning' as 'error', `${result.succeeded} succeeded, ${result.failed} failed.${skippedMsg}`);
      }

      clearSelection();
      refetch();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : `Failed to ${action} VMs.`;
      addToast('error', message);
    } finally {
      setActionLoading(false);
      setBulkAction(null);
    }
  };

  const bulkActionConfig = {
    start:    { label: 'Start VMs',    variant: 'warning' as const, description: `Start ${selected.size} selected VM${selected.size !== 1 ? 's' : ''}?` },
    stop:     { label: 'Stop VMs',     variant: 'warning' as const, description: `Gracefully stop ${selected.size} selected VM${selected.size !== 1 ? 's' : ''}?` },
    delete:   { label: 'Delete VMs',   variant: 'danger'  as const, description: `Permanently delete ${selected.size} VM${selected.size !== 1 ? 's' : ''}? This cannot be undone.` },
    restrict: { label: 'Restrict VMs', variant: 'warning' as const, description: `Restrict ${selected.size} VM${selected.size !== 1 ? 's' : ''}? All power and delete actions will be blocked until the restriction is removed.` },
  };

  const totalRestrictedInList = vms.filter((v) => v.isRestricted).length;

  return (
    <div className="max-w-screen-xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {bulkAction && (
        <ConfirmModal
          open
          title={bulkActionConfig[bulkAction].label}
          description={bulkActionConfig[bulkAction].description}
          confirmLabel={bulkActionConfig[bulkAction].label}
          confirmVariant={bulkActionConfig[bulkAction].variant}
          loading={actionLoading}
          onConfirm={() => void executeBulkAction(bulkAction)}
          onCancel={() => setBulkAction(null)}
        />
      )}

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
          <button
            onClick={exportCredentials}
            disabled={loading || vms.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Export Credentials
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
          {/* Filters + bulk action toolbar */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3 min-h-[60px]">
            {selected.size > 0 ? (
              /* Bulk action toolbar */
              <div className="flex items-center gap-3 w-full flex-wrap">
                <span className="text-sm font-semibold text-gray-900">
                  {selected.size} selected
                </span>
                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={() => setBulkAction('start')}
                    disabled={!allStopped}
                    title={!allStopped ? 'All selected VMs must be stopped' : 'Start selected VMs'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Play className="w-3 h-3" /> Start
                  </button>
                  <button
                    onClick={() => setBulkAction('stop')}
                    disabled={!allRunning}
                    title={!allRunning ? 'All selected VMs must be running' : 'Stop selected VMs'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Square className="w-3 h-3" /> Stop
                  </button>
                  <button
                    onClick={() => setBulkAction('delete')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                  <button
                    onClick={() => setBulkAction('restrict')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition"
                  >
                    <Shield className="w-3 h-3" /> Restrict
                  </button>
                </div>
                {totalRestrictedInList > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                    <Shield className="w-3 h-3" />
                    {totalRestrictedInList} restricted VM{totalRestrictedInList !== 1 ? 's' : ''} excluded
                  </span>
                )}
                <button
                  onClick={clearSelection}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  <X className="w-3.5 h-3.5" /> Clear selection
                </button>
              </div>
            ) : (
              /* Normal filters */
              <>
                <p className="text-sm font-semibold text-gray-900">Virtual Machines</p>
                <div className="flex items-center gap-2">
                  <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); clearSelection(); }} className={selectClass} aria-label="Filter by status">
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select value={cloneFilter} onChange={(e) => { setCloneFilter(e.target.value); clearSelection(); }} className={selectClass} aria-label="Filter by clone type">
                    {CLONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {loading ? (
            <TableSkeleton rows={5} cols={8} />
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
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleAll}
                        disabled={selectableVMs.length === 0}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Select all selectable VMs"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">VM</th>
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
                  {vms.map((vm, i) => {
                    const isSelected = selected.has(vm._id);
                    const isRestricted = vm.isRestricted === true;
                    return (
                      <tr
                        key={vm._id}
                        className={`border-b border-gray-50 transition-colors ${
                          isRestricted
                            ? 'bg-amber-50/40'
                            : isSelected
                            ? 'bg-blue-50'
                            : i % 2 !== 0
                            ? 'bg-gray-50/40 hover:bg-gray-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isRestricted}
                            onChange={() => !isRestricted && toggleOne(vm._id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={isRestricted ? `${vm.name} (restricted — cannot be selected)` : `Select ${vm.name}`}
                            title={isRestricted ? 'Restricted VM — remove restriction to include in bulk actions' : undefined}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <Link href={`/dashboard/admin/vms/${vm._id}`} className="block">
                            <div className="flex items-center gap-1.5">
                              <p className={`font-medium hover:text-blue-600 transition-colors ${isRestricted ? 'text-gray-500' : 'text-gray-900'}`}>{vm.name}</p>
                              {isRestricted && (
                                <span title="Restricted" aria-label="Restricted">
                                  <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                </span>
                              )}
                            </div>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
