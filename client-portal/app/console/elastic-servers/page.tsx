'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { useExternalVMs } from '../../../hooks/useExternalVMs';
import { ToastContainer, useToast } from '../../../components/ui/Toast';
import { ConfirmModal } from '../../../components/ui/ConfirmModal';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { ApiError } from '../../../lib/apiClient';
import {
  deleteExternalVM,
  externalVmProtocolBadgeClass,
  type ExternalVMProtocol,
  type IExternalVM,
} from '../../../lib/externalVmApi';
import { formatAssignmentHolders } from '../../../lib/externalVmAssignmentFormat';
import { Server, Plus, Upload, RefreshCw, Monitor, Trash2 } from 'lucide-react';

function ProtocolBadge({ protocol }: { protocol: ExternalVMProtocol }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${externalVmProtocolBadgeClass(protocol)}`}
    >
      {protocol}
    </span>
  );
}

export default function MyServersPage() {
  const { isAuthenticated } = useAuth();
  const { vms, loading, error, refetch } = useExternalVMs(isAuthenticated);
  const { toasts, addToast, dismiss } = useToast();

  const [pendingDelete, setPendingDelete] = useState<IExternalVM | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleOpenConsole = (vm: IExternalVM) => {
    // The console viewer page fetches the Guacamole session by id, so the
    // session token never appears in the browser address bar / history.
    // Opened in a new tab so the server list stays available in the original tab.
    window.open(`/console/elastic-servers/${vm._id}/console`, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    try {
      await deleteExternalVM(pendingDelete._id);
      addToast('success', `${pendingDelete.name} deleted.`);
      setPendingDelete(null);
      refetch();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete server.');
    } finally {
      setDeleteLoading(false);
    }
  };

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

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Servers</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading
              ? 'Loading…'
              : `${vms.length} external server${vms.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/console/elastic-servers/add"
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717]"
          >
            <Plus className="h-4 w-4" />
            Add Server
          </Link>
          <Link
            href="/console/elastic-servers/bulk"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <Upload className="h-4 w-4" />
            Bulk Import
          </Link>
        </div>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : vms.length === 0 ? (
            <div className="p-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <Server className="h-7 w-7 text-gray-400" />
              </div>
              <p className="font-medium text-gray-600">No servers added yet</p>
              <p className="mt-1 text-sm text-gray-400">Click Add Server to get started.</p>
              <Link
                href="/console/elastic-servers/add"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717]"
              >
                <Plus className="h-4 w-4" />
                Add Server
              </Link>
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
                      Assigned users
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      When
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm, i) => {
                    const holders = formatAssignmentHolders(vm.assignments);
                    return (
                    <tr
                      key={vm._id}
                      className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                        i % 2 !== 0 ? 'bg-gray-50/40' : ''
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
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-600">{vm.ipAddress}</td>
                      <td className="px-4 py-3.5">
                        <ProtocolBadge protocol={vm.protocol} />
                      </td>
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
                              key={`${vm._id}-s-${idx}`}
                              className="max-w-[16rem] truncate text-[11px] text-gray-500"
                              title={s}
                            >
                              {s}
                            </p>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenConsole(vm)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                            title="Open browser console in a new tab"
                          >
                            <Monitor className="h-3.5 w-3.5" />
                            Console
                          </button>
                          <button
                            onClick={() => setPendingDelete(vm)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                            title="Delete server"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
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
