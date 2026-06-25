'use client';

import { useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useMachines } from '../../../../hooks/useMachines';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { deleteMachine, type IMachine, type MachineStatus } from '../../../../lib/machineManagerApi';
import { ApiError } from '../../../../lib/apiClient';
import { Server, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';

function MachineStatusBadge({ status }: { status: MachineStatus }) {
  const cfg: Record<MachineStatus, { label: string; dot: string; badge: string }> = {
    pending:  { label: 'Pending',  dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-500 border-gray-200' },
    online:   { label: 'Online',   dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 border-green-200' },
    offline:  { label: 'Offline',  dot: 'bg-red-400',   badge: 'bg-red-50 text-red-600 border-red-200' },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${c.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export default function MyMachinesPage() {
  const { isAuthenticated } = useAuth();
  const { machines, loading, error, refetch } = useMachines(isAuthenticated);
  const { toasts, addToast, dismiss } = useToast();

  const [pendingDelete, setPendingDelete] = useState<IMachine | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    try {
      await deleteMachine(pendingDelete._id);
      addToast('success', `${pendingDelete.name} deleted.`);
      setPendingDelete(null);
      refetch();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete machine.');
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
          title="Delete machine"
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
          <h1 className="text-2xl font-bold text-gray-900">My Machines</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Loading…' : `${machines.length} machine${machines.length !== 1 ? 's' : ''}`}
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
            href="/console/machine-manager/setup"
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717]"
          >
            <Server className="h-4 w-4" />
            Add Machine
          </Link>
        </div>
      </div>

      {error && !loading && <ErrorState title="Failed to load machines" message={error} onRetry={refetch} />}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : machines.length === 0 ? (
            <div className="p-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <Server className="h-7 w-7 text-gray-400" />
              </div>
              <p className="font-medium text-gray-600">No machines added yet</p>
              <p className="mt-1 text-sm text-gray-400">Use the Setup Wizard to add your first machine.</p>
              <Link
                href="/console/machine-manager/setup"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717]"
              >
                Setup Wizard
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Name', 'IP Address', 'OS', 'Status', 'Last Seen', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {machines.map((m, i) => (
                    <tr key={m._id} className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                            <Server className="h-4 w-4" />
                          </span>
                          <span className="font-medium text-gray-900">{m.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-600">{m.ipAddress}</td>
                      <td className="px-5 py-3 capitalize text-gray-600">{m.os}</td>
                      <td className="px-5 py-3"><MachineStatusBadge status={m.status} /></td>
                      <td className="px-5 py-3 text-xs text-gray-400">
                        {m.lastSeen ? new Date(m.lastSeen).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setPendingDelete(m)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
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
