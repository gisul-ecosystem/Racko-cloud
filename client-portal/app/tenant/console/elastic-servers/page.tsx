'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useExternalVMs } from '@/hooks/useExternalVMs';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { ApiError } from '@/lib/apiClient';
import {
  deleteTenantExternalVM,
  fetchTenantExternalVMs,
  type ExternalVMProtocol,
  type IExternalVM,
} from '@/lib/tenantExternalVmApi';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { hexToRgba, tenantAccentButton } from '@/lib/tenantAccentStyles';
import { Server, Plus, Upload, RefreshCw, Monitor, Trash2 } from 'lucide-react';

function ProtocolBadge({ protocol }: { protocol: ExternalVMProtocol }) {
  const styles =
    protocol === 'rdp'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-green-50 text-green-700 border-green-200';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${styles}`}
    >
      {protocol}
    </span>
  );
}

export default function TenantMyServersPage() {
  const router = useRouter();
  const { isAuthenticated } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const listFn = useCallback(() => fetchTenantExternalVMs(), []);
  const { vms, loading, error, refetch } = useExternalVMs(isAuthenticated, listFn);
  const { toasts, addToast, dismiss } = useToast();

  const [pendingDelete, setPendingDelete] = useState<IExternalVM | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [consoleLoadingId, setConsoleLoadingId] = useState<string | null>(null);

  const handleOpenConsole = (vm: IExternalVM) => {
    setConsoleLoadingId(vm._id);
    router.push(`${tenantConsole.elastic}/${vm._id}/console`);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    try {
      await deleteTenantExternalVM(pendingDelete._id);
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
                href={tenantConsole.elasticAdd}
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                style={tenantAccentButton(accentColor)}
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
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm, i) => (
                    <tr
                      key={vm._id}
                      className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                        i % 2 !== 0 ? 'bg-gray-50/40' : ''
                      }`}
                    >
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
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-600">{vm.ipAddress}</td>
                      <td className="px-4 py-3.5">
                        <ProtocolBadge protocol={vm.protocol} />
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenConsole(vm)}
                            disabled={consoleLoadingId === vm._id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                            title="Open browser console"
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
