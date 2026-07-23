'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  Download,
  Play,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { AccessScheduleBadge } from '@/components/access-schedule/AccessScheduleBadge';
import { EditAccessScheduleModal } from '@/components/access-schedule/EditAccessScheduleModal';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { CloneTypeBadge, VMStatusBadge } from '@/components/dashboard/VMStatusBadge';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { ApiError } from '@/lib/apiClient';
import {
  formatAccessScheduleDigest,
  toAccessSchedule,
  type AccessScheduleInput,
} from '@/lib/accessSchedule';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { tenantVps } from '@/lib/tenantAdminRoutes';
import {
  fetchTenantVms,
  startTenantVm,
  stopTenantVm,
  updateTenantVmSchedule,
} from '@/lib/tenantVmApi';
import type { TenantVmSummary } from '@/types/tenantPortal';
import type { CloneType, VMStatus } from '@/lib/vmApi';

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

/** My VMs list — same layout/columns as admin `/dashboard/admin/vms`, tenant-scoped data. */
export function TenantVmListView() {
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();
  const isAdmin = tenantUser?.role === 'tenant_admin';

  const [vms, setVms] = useState<TenantVmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [cloneFilter, setCloneFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<TenantVmSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTenantVms({
        status: statusFilter || undefined,
      });
      let list = result.vms;
      if (cloneFilter) {
        list = list.filter((v) => v.cloneType === cloneFilter);
      }
      setVms(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VMs.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, cloneFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectableVMs = vms;
  const allSelected = selectableVMs.length > 0 && selected.size === selectableVMs.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableVMs.map((v) => v.id)));
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

  const exportCredentials = useCallback(() => {
    if (vms.length === 0) return;
    const headers = ['VM Name', 'IP Address', 'Username', 'Password', 'Status', 'Node'];
    const rows = vms.map((vm) => [
      vm.name,
      vm.ipAddress ?? '',
      '',
      '',
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

  const selectedVMs = useMemo(
    () => vms.filter((v) => selected.has(v.id)),
    [vms, selected]
  );
  const allStopped = selectedVMs.every((v) => v.status === 'stopped');
  const allRunning = selectedVMs.every((v) => v.status === 'running');

  const executeBulkAction = async (action: BulkAction) => {
    setActionLoading(true);
    try {
      if (action === 'delete' || action === 'restrict') {
        addToast(
          'error',
          action === 'delete'
            ? 'Bulk delete is not available in the tenant portal.'
            : 'Restrict is not available in the tenant portal.'
        );
        return;
      }

      const results = await Promise.allSettled(
        selectedVMs.map((vm) => (action === 'start' ? startTenantVm(vm.id) : stopTenantVm(vm.id)))
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (failed === 0) {
        addToast(
          'success',
          `${succeeded} VM${succeeded !== 1 ? 's' : ''} ${action === 'start' ? 'started' : 'stopped'} successfully.`
        );
      } else if (succeeded === 0) {
        addToast('error', `Failed to ${action} all ${failed} VM${failed !== 1 ? 's' : ''}.`);
      } else {
        addToast('error', `${succeeded} succeeded, ${failed} failed.`);
      }
      clearSelection();
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : `Failed to ${action} VMs.`);
    } finally {
      setActionLoading(false);
      setBulkAction(null);
    }
  };

  const bulkActionConfig = {
    start: {
      label: 'Start VMs',
      variant: 'warning' as const,
      description: `Start ${selected.size} selected VM${selected.size !== 1 ? 's' : ''}?`,
    },
    stop: {
      label: 'Stop VMs',
      variant: 'warning' as const,
      description: `Gracefully stop ${selected.size} selected VM${selected.size !== 1 ? 's' : ''}?`,
    },
    delete: {
      label: 'Delete VMs',
      variant: 'danger' as const,
      description: `Permanently delete ${selected.size} VM${selected.size !== 1 ? 's' : ''}? This cannot be undone.`,
    },
    restrict: {
      label: 'Restrict VMs',
      variant: 'warning' as const,
      description: `Restrict ${selected.size} VM${selected.size !== 1 ? 's' : ''}?`,
    },
  };

  async function saveSchedule(payload: AccessScheduleInput) {
    if (!scheduleTarget) return;
    await updateTenantVmSchedule(scheduleTarget.id, payload);
    addToast('success', 'Access schedule updated.');
    await load();
  }

  return (
    <div className="max-w-screen-xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {bulkAction ? (
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
      ) : null}

      {scheduleTarget ? (
        <EditAccessScheduleModal
          open
          vmName={scheduleTarget.name}
          initialSchedule={toAccessSchedule(scheduleTarget.accessSchedule)}
          onClose={() => setScheduleTarget(null)}
          onSave={saveSchedule}
        />
      ) : null}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My VMs</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Loading…' : `${vms.length} VM${vms.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCredentials}
            disabled={loading || vms.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export Credentials
          </button>
          {isAdmin ? (
            <Link
              href={tenantVps.createVm}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
              style={tenantAccentButton(accentColor)}
            >
              <Plus className="h-4 w-4" />
              Create VM
            </Link>
          ) : null}
        </div>
      </div>

      {error && !loading ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!error ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
            {selected.size > 0 ? (
              <div className="flex w-full flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">{selected.size} selected</span>
                <div className="ml-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkAction('start')}
                    disabled={!allStopped}
                    title={!allStopped ? 'All selected VMs must be stopped' : 'Start selected VMs'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Play className="h-3 w-3" /> Start
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkAction('stop')}
                    disabled={!allRunning}
                    title={!allRunning ? 'All selected VMs must be running' : 'Stop selected VMs'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Square className="h-3 w-3" /> Stop
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkAction('delete')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkAction('restrict')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                  >
                    <Shield className="h-3 w-3" /> Restrict
                  </button>
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400 transition hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" /> Clear selection
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">Virtual Machines</p>
                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      clearSelection();
                    }}
                    className={selectClass}
                    aria-label="Filter by status"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={cloneFilter}
                    onChange={(e) => {
                      setCloneFilter(e.target.value);
                      clearSelection();
                    }}
                    className={selectClass}
                    aria-label="Filter by clone type"
                  >
                    {CLONE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {loading ? (
            <TableSkeleton rows={5} cols={8} />
          ) : vms.length === 0 ? (
            <div className="p-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <Server className="h-7 w-7 text-gray-400" />
              </div>
              <p className="font-medium text-gray-600">No VMs found</p>
              <p className="mt-1 text-sm text-gray-400">
                {statusFilter || cloneFilter
                  ? 'Try adjusting your filters.'
                  : 'Create your first VM to get started.'}
              </p>
              {!statusFilter && !cloneFilter && isAdmin ? (
                <Link
                  href={tenantVps.createVm}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  style={tenantAccentButton(accentColor)}
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
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleAll}
                        disabled={selectableVMs.length === 0}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Select all selectable VMs"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      VM
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Access
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Node
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      CPU
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      RAM
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Disk
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      IP
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Created
                    </th>
                    {isAdmin ? (
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Schedule
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm, i) => {
                    const isSelected = selected.has(vm.id);
                    const schedule = toAccessSchedule(vm.accessSchedule);
                    return (
                      <tr
                        key={vm.id}
                        className={`border-b border-gray-50 transition-colors ${
                          isSelected
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
                            onChange={() => toggleOne(vm.id)}
                            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            aria-label={`Select ${vm.name}`}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <Link href={tenantVps.vm(vm.id)} className="block">
                            <p className="font-medium text-gray-900 transition-colors hover:text-blue-600">
                              {vm.name}
                            </p>
                            <p className="font-mono text-xs text-gray-400">#{vm.vmid}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5">
                          <VMStatusBadge status={vm.status as VMStatus} />
                        </td>
                        <td className="px-4 py-3.5">
                          <AccessScheduleBadge schedule={schedule} />
                          <p
                            className="mt-1 max-w-[14rem] truncate text-[11px] text-gray-400"
                            title={formatAccessScheduleDigest(schedule)}
                          >
                            {formatAccessScheduleDigest(schedule)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <CloneTypeBadge type={vm.cloneType as CloneType} />
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500">{vm.node}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedCpu} vCPU</td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">
                          {vm.allocatedMemoryGb} GB
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">
                          {vm.allocatedDiskGb} GB
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-gray-400">
                          {vm.ipAddress ?? '—'}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-400">
                          {new Date(vm.createdAt).toLocaleDateString()}
                        </td>
                        {isAdmin ? (
                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => setScheduleTarget(vm)}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              title="Edit access schedule"
                            >
                              <CalendarClock className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
