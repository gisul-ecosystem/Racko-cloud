'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../../context/AuthContext';
import { fetchMyVMs, unrestrictVM, type IVM } from '../../../../../lib/vmApi';
import { VMStatusBadge } from '../../../../../components/dashboard/VMStatusBadge';
import { TableSkeleton } from '../../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../../components/dashboard/ErrorState';
import { ConfirmModal } from '../../../../../components/ui/ConfirmModal';
import { ToastContainer, useToast } from '../../../../../components/ui/Toast';
import { ApiError } from '../../../../../lib/apiClient';
import { Shield, ShieldOff, RefreshCw, ChevronLeft, Loader2, X } from 'lucide-react';
import type { VMStatus } from '../../../../../lib/vmApi';

export default function RestrictedVMsPage() {
  const { isAuthenticated } = useAuth();
  const { toasts, addToast, dismiss } = useToast();

  const [vms, setVMs] = useState<IVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const allSelected = vms.length > 0 && selected.size === vms.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(vms.map((v) => v._id)));
    }
  }, [allSelected, vms]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Set());

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const all = await fetchMyVMs({ isRestricted: true });
      setVMs(all);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load restricted VMs.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  // Single VM unrestrict
  async function handleRemove(vm: IVM) {
    setRemovingId(vm._id);
    try {
      await unrestrictVM(vm._id);
      addToast('success', `Restriction removed from ${vm.name}.`);
      setVMs((prev) => prev.filter((v) => v._id !== vm._id));
      setSelected((prev) => { const next = new Set(prev); next.delete(vm._id); return next; });
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to remove restriction.');
    } finally {
      setRemovingId(null);
    }
  }

  // Bulk unrestrict
  async function handleBulkUnrestrict() {
    setBulkLoading(true);
    const selectedVMs = vms.filter((v) => selected.has(v._id));
    try {
      const results = await Promise.allSettled(selectedVMs.map((vm) => unrestrictVM(vm._id)));
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeededIds = new Set(
        selectedVMs.filter((_, i) => results[i]?.status === 'fulfilled').map((v) => v._id)
      );
      setVMs((prev) => prev.filter((v) => !succeededIds.has(v._id)));
      clearSelection();
      if (failed === 0) {
        addToast('success', `Restriction removed from ${succeeded} VM${succeeded !== 1 ? 's' : ''}.`);
      } else {
        addToast('error' as 'error', `${succeeded} unrestricted, ${failed} failed.`);
      }
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to unrestrict VMs.');
    } finally {
      setBulkLoading(false);
      setShowBulkConfirm(false);
    }
  }

  return (
    <div className="max-w-screen-xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {showBulkConfirm && (
        <ConfirmModal
          open
          title="Remove Restrictions"
          description={`Remove restriction from ${selected.size} VM${selected.size !== 1 ? 's' : ''}? Power and delete actions will be re-enabled.`}
          confirmLabel="Remove Restrictions"
          confirmVariant="warning"
          loading={bulkLoading}
          onConfirm={() => void handleBulkUnrestrict()}
          onCancel={() => setShowBulkConfirm(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/dashboard/admin/vms"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-2"
          >
            <ChevronLeft className="w-4 h-4" /> Back to VMs
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Restricted VMs</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Loading…' : `${vms.length} restricted VM${vms.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3 min-h-[60px]">
            {selected.size > 0 ? (
              <div className="flex items-center gap-3 w-full flex-wrap">
                <span className="text-sm font-semibold text-gray-900">
                  {selected.size} selected
                </span>
                <button
                  onClick={() => setShowBulkConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition"
                >
                  <ShieldOff className="w-3 h-3" /> Unrestrict
                </button>
                <button
                  onClick={clearSelection}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  <X className="w-3.5 h-3.5" /> Clear selection
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full">
                <Shield className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-semibold text-gray-900">Restricted Virtual Machines</p>
                <span className="ml-auto text-xs text-gray-400">
                  All power & delete actions are blocked for these VMs
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <TableSkeleton rows={4} cols={7} />
          ) : vms.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-amber-400" />
              </div>
              <p className="text-gray-600 font-medium">No restricted VMs</p>
              <p className="text-gray-400 text-sm mt-1">
                Restrict a VM from its detail page to protect it from accidental actions.
              </p>
              <Link
                href="/dashboard/admin/vms"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
              >
                Go to My VMs
              </Link>
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
                        className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                        aria-label="Select all restricted VMs"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">VM</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Node</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">CPU</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">RAM</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm, i) => {
                    const isSelected = selected.has(vm._id);
                    return (
                      <tr
                        key={vm._id}
                        className={`border-b border-gray-50 transition-colors ${
                          isSelected ? 'bg-amber-50' : i % 2 !== 0 ? 'bg-amber-50/20 hover:bg-amber-50/50' : 'hover:bg-amber-50/50'
                        }`}
                      >
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(vm._id)}
                            className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                            aria-label={`Select ${vm.name}`}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <Link href={`/dashboard/admin/vms/${vm._id}`} className="block">
                            <div className="flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <p className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                                {vm.name}
                              </p>
                            </div>
                            <p className="text-xs text-gray-400 font-mono pl-5">#{vm.vmid} · {vm.templateName}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5">
                          <VMStatusBadge status={vm.status as VMStatus} />
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500">{vm.node}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedCpu} vCPU</td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedMemoryGb} GB</td>
                        <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">{vm.ipAddress ?? '—'}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-400">
                          {new Date(vm.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => void handleRemove(vm)}
                            disabled={removingId === vm._id}
                            title="Remove restriction"
                            aria-label={`Remove restriction from ${vm.name}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {removingId === vm._id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShieldOff className="w-3.5 h-3.5" />
                            )}
                            Remove
                          </button>
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
