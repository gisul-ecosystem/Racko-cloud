'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { useExternalVMs } from '@/hooks/useExternalVMs';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { AccessScheduleBadge } from '@/components/access-schedule/AccessScheduleBadge';
import { EditAccessScheduleModal } from '@/components/access-schedule/EditAccessScheduleModal';
import {
  GrantAccessOverrideModal,
  type AccessOverridePayload,
} from '@/components/access-schedule/GrantAccessOverrideModal';
import { ApiError } from '@/lib/apiClient';
import {
  formatAccessScheduleDigest,
  toAccessSchedule,
  type AccessScheduleInput,
} from '@/lib/accessSchedule';
import {
  bulkDeleteTenantExternalVMs,
  bulkUpdateTenantExternalVmOverride,
  deleteTenantExternalVM,
  fetchTenantExternalVMs,
  updateTenantExternalVmOverride,
  updateTenantExternalVmSchedule,
  type ExternalVMProtocol,
  type IExternalVM,
} from '@/lib/tenantExternalVmApi';
import { externalVmProtocolBadgeClass } from '@/lib/externalVmApi';
import { formatAssignmentHolders, formatAssignmentSchedule } from '@/lib/externalVmAssignmentFormat';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { openTenantUrlWithSession } from '@/lib/tenantPortalApiClient';
import { hexToRgba, tenantAccentButton } from '@/lib/tenantAccentStyles';
import { CalendarClock, Server, Plus, Upload, RefreshCw, Monitor, Trash2, Shield } from 'lucide-react';

function ProtocolBadge({ protocol }: { protocol: ExternalVMProtocol }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${externalVmProtocolBadgeClass(protocol)}`}
    >
      {protocol}
    </span>
  );
}

export default function TenantMyServersPage() {
  const { isAuthenticated, tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const { isConsoleStaff, hasPermission } = useTenantRbac();
  const isAdmin = isConsoleStaff && hasPermission('elastic.manage', 'elastic.read');
  const listFn = useCallback(() => fetchTenantExternalVMs(), []);
  const { vms, loading, error, refetch } = useExternalVMs(isAuthenticated, listFn);
  const { toasts, addToast, dismiss } = useToast();

  const [pendingDelete, setPendingDelete] = useState<IExternalVM | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<IExternalVM | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<{
    ids: string[];
    label: string;
    currentlyActive: boolean;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(vms.map((vm) => vm._id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [vms]);

  const allSelected = vms.length > 0 && selectedIds.size === vms.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const selectedServers = useMemo(
    () => vms.filter((vm) => selectedIds.has(vm._id)),
    [vms, selectedIds]
  );

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(vms.map((vm) => vm._id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenConsole = (vm: IExternalVM) => {
    if (!isAdmin && vm.myAccess && !vm.myAccess.allowedNow) {
      addToast(
        'error',
        vm.myAccess.nextWindow
          ? `Outside your access window. Next allowed: ${vm.myAccess.nextWindow}`
          : 'Outside your access window.'
      );
      return;
    }
    openTenantUrlWithSession(`${tenantConsole.elastic}/${vm._id}/console`);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    try {
      await deleteTenantExternalVM(pendingDelete._id);
      addToast('success', `${pendingDelete.name} deleted.`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(pendingDelete._id);
        return next;
      });
      setPendingDelete(null);
      refetch();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete server.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleteLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const chunkSize = 250;
      let deleted = 0;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const result = await bulkDeleteTenantExternalVMs(chunk);
        deleted += result.deleted;
      }
      addToast(
        'success',
        `${deleted} server${deleted === 1 ? '' : 's'} deleted.`
      );
      setSelectedIds(new Set());
      setPendingBulkDelete(false);
      refetch();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete servers.');
    } finally {
      setDeleteLoading(false);
    }
  };

  async function saveSchedule(payload: AccessScheduleInput) {
    if (!scheduleTarget) return;
    await updateTenantExternalVmSchedule(scheduleTarget._id, payload);
    addToast('success', 'Access schedule updated.');
    setScheduleTarget(null);
    refetch();
  }

  async function saveOverride(payload: AccessOverridePayload) {
    if (!overrideTarget) return;
    if (overrideTarget.ids.length === 1) {
      await updateTenantExternalVmOverride(overrideTarget.ids[0]!, payload);
    } else {
      await bulkUpdateTenantExternalVmOverride(overrideTarget.ids, payload);
    }
    addToast(
      'success',
      payload.accessOverride ? 'Access override granted.' : 'Access override revoked.'
    );
    setOverrideTarget(null);
    refetch();
  }

  return (
    <div className="max-w-screen-xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {pendingDelete && (
        <ConfirmModal
          open
          title="Delete server"
          description={`Permanently remove "${pendingDelete.name}" (${pendingDelete.ipAddress})? This cannot be undone.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingBulkDelete && (
        <ConfirmModal
          open
          title="Delete selected servers"
          description={`Permanently remove ${selectedServers.length} server${
            selectedServers.length === 1 ? '' : 's'
          } from the database? This cannot be undone.`}
          confirmLabel={`Delete ${selectedServers.length}`}
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={() => void handleBulkDelete()}
          onCancel={() => setPendingBulkDelete(false)}
        />
      )}

      {scheduleTarget ? (
        <EditAccessScheduleModal
          open
          vmName={scheduleTarget.name}
          initialSchedule={toAccessSchedule(scheduleTarget.accessSchedule)}
          onClose={() => setScheduleTarget(null)}
          onSave={saveSchedule}
        />
      ) : null}

      {overrideTarget ? (
        <GrantAccessOverrideModal
          open
          vmName={overrideTarget.label}
          currentlyActive={overrideTarget.currentlyActive}
          onClose={() => setOverrideTarget(null)}
          onSave={saveOverride}
        />
      ) : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Servers</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading
              ? 'Loading…'
              : `${vms.length} external server${vms.length !== 1 ? 's' : ''}`}
            {isAdmin && selectedIds.size > 0
              ? ` · ${selectedIds.size} selected`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && vms.length > 0 ? (
            <>
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() =>
                  setOverrideTarget({
                    ids: selectedServers.map((vm) => vm._id),
                    label: `${selectedServers.length} selected server${
                      selectedServers.length === 1 ? '' : 's'
                    }`,
                    currentlyActive: selectedServers.some((vm) =>
                      Boolean(toAccessSchedule(vm.accessSchedule)?.override)
                    ),
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Shield className="h-3.5 w-3.5" />
                Override selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || deleteLoading}
                onClick={() => setPendingBulkDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </button>
            </>
          ) : null}
          <button
            onClick={refetch}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isAdmin && (
            <>
              <Link
                href={tenantConsole.elasticAdd}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
                style={tenantAccentButton(accentColor)}
              >
                <Plus className="h-4 w-4" />
                Add Server
              </Link>
              <Link
                href={tenantConsole.elasticBulk}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                <Upload className="h-4 w-4" />
                Bulk Import
              </Link>
            </>
          )}
        </div>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : vms.length === 0 ? (
            <div className="p-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <Server className="h-7 w-7 text-gray-400" />
              </div>
              <p className="font-medium text-gray-600">
                {isAdmin ? 'No servers added yet' : 'No servers assigned yet'}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                {isAdmin ? 'Click Add Server to get started.' : 'Contact your administrator to get a server assigned.'}
              </p>
              {isAdmin && (
                <Link
                  href={tenantConsole.elasticAdd}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  style={tenantAccentButton(accentColor)}
                >
                  <Plus className="h-4 w-4" />
                  Add Server
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {isAdmin ? (
                      <th className="sticky left-0 z-10 w-10 bg-gray-50 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={toggleAll}
                          className="h-4 w-4 cursor-pointer rounded border-gray-300"
                          aria-label="Select all servers"
                        />
                      </th>
                    ) : null}
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      IP Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Protocol
                    </th>
                    {isAdmin ? (
                      <>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Assigned users
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          When
                        </th>
                      </>
                    ) : (
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Access
                      </th>
                    )}
                    <th className="sticky right-0 z-10 bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm, i) => {
                    const schedule = toAccessSchedule(vm.accessSchedule);
                    const holders = formatAssignmentHolders(vm.assignments);
                    const consoleBlocked = !isAdmin && Boolean(vm.myAccess && !vm.myAccess.allowedNow);
                    const isSelected = selectedIds.has(vm._id);
                    const rowBg = isSelected
                      ? 'bg-blue-50'
                      : i % 2 !== 0
                        ? 'bg-gray-50/40'
                        : 'bg-white';
                    return (
                      <tr
                        key={vm._id}
                        className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${rowBg}`}
                      >
                        {isAdmin ? (
                          <td
                            className={`sticky left-0 z-10 px-4 py-3.5 ${rowBg}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(vm._id)}
                              className="h-4 w-4 cursor-pointer rounded border-gray-300"
                              aria-label={`Select ${vm.name}`}
                            />
                          </td>
                        ) : null}
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                backgroundColor: hexToRgba(accentColor, 0.1),
                                color: accentColor,
                              }}
                            >
                              <Server className="h-4 w-4" />
                            </span>
                            <span className="font-medium text-gray-900">{vm.name}</span>
                            <p className="text-xs text-gray-400">
                              {vm.protocol.toUpperCase()} · {vm.username}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-gray-600">{vm.ipAddress}</td>
                        <td className="px-4 py-3.5">
                          <ProtocolBadge protocol={vm.protocol} />
                        </td>
                        {isAdmin ? (
                          <>
                            <td className="px-4 py-3.5">
                              <div className="space-y-0.5">
                                {holders.labels.map((label) => (
                                  <p key={label} className="text-xs text-gray-800">
                                    {label}
                                  </p>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="space-y-0.5">
                                {holders.schedules.map((s, idx) => (
                                  <p
                                    key={`${vm._id}-when-${idx}`}
                                    className="max-w-[16rem] truncate text-[11px] text-gray-500"
                                    title={s}
                                  >
                                    {s}
                                  </p>
                                ))}
                              </div>
                            </td>
                          </>
                        ) : (
                          <td className="px-4 py-3.5">
                            <AccessScheduleBadge schedule={schedule} />
                            <p
                              className="mt-1 max-w-[14rem] truncate text-[11px] text-gray-400"
                              title={
                                vm.myAccess?.schedule
                                  ? formatAssignmentSchedule(vm.myAccess.schedule)
                                  : formatAccessScheduleDigest(schedule)
                              }
                            >
                              {vm.myAccess?.schedule
                                ? formatAssignmentSchedule(vm.myAccess.schedule)
                                : formatAccessScheduleDigest(schedule)}
                            </p>
                            {consoleBlocked && vm.myAccess?.nextWindow ? (
                              <p className="mt-1 text-[11px] text-amber-700">
                                Next: {vm.myAccess.nextWindow}
                              </p>
                            ) : null}
                          </td>
                        )}
                        <td className={`sticky right-0 z-10 px-4 py-3.5 ${rowBg}`}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenConsole(vm)}
                              disabled={consoleBlocked}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                              title={
                                consoleBlocked
                                  ? vm.myAccess?.nextWindow
                                    ? `Outside access window. Next: ${vm.myAccess.nextWindow}`
                                    : 'Outside your access window'
                                  : 'Open browser console in a new tab'
                              }
                            >
                              <Monitor className="h-3.5 w-3.5" />
                              Console
                            </button>
                            {isAdmin ? (
                              <>
                                <button
                                  onClick={() => setScheduleTarget(vm)}
                                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-1.5 text-gray-700 transition hover:bg-gray-50"
                                  title="Edit access schedule"
                                >
                                  <CalendarClock className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() =>
                                    setOverrideTarget({
                                      ids: [vm._id],
                                      label: vm.name,
                                      currentlyActive: Boolean(
                                        toAccessSchedule(vm.accessSchedule)?.override
                                      ),
                                    })
                                  }
                                  className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-800 transition hover:bg-amber-100"
                                  title="Grant access override"
                                >
                                  <Shield className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setPendingDelete(vm)}
                                  className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 transition hover:bg-red-100"
                                  title="Delete server"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
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
