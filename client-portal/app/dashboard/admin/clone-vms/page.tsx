'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { useClonedVMs } from '../../../../hooks/useClonedVMs';
import { VMStatusBadge } from '../../../../components/dashboard/VMStatusBadge';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { cloneVM, fetchMyVMs } from '../../../../lib/vmApi';
import { ApiError } from '../../../../lib/apiClient';
import { Copy, RefreshCw, X, Server, AlertTriangle, Search } from 'lucide-react';
import type { VMStatus, IVM } from '../../../../lib/vmApi';

// ─── Clone VM Modal ───────────────────────────────────────────────────────────

interface CloneVMModalProps {
  onClose: () => void;
  onSuccess: (jobId: string) => void;
  addToast: (type: 'success' | 'error', message: string) => void;
}

function CloneVMModal({ onClose, onSuccess, addToast }: CloneVMModalProps) {
  const [allVMs, setAllVMs] = useState<IVM[]>([]);
  const [loadingVMs, setLoadingVMs] = useState(true);
  const [vmError, setVmError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedVM, setSelectedVM] = useState<IVM | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);
  const [nameError, setNameError] = useState('');

  // Load VMs when modal mounts
  useEffect(() => {
    void (async () => {
      try {
        const vms = await fetchMyVMs();
        setAllVMs(vms.filter((v) => !['creating', 'deleting', 'deleted', 'delete_failed'].includes(v.status)));
      } catch (err) {
        setVmError(err instanceof ApiError ? err.message : 'Failed to load VMs.');
      } finally {
        setLoadingVMs(false);
      }
    })();
  }, []);

  const filteredVMs = allVMs.filter((vm) =>
    vm.name.toLowerCase().includes(search.toLowerCase()) ||
    String(vm.vmid).includes(search)
  );

  const validateName = (val: string) => {
    if (!val) return 'Name is required.';
    if (val.length < 3) return 'Name must be at least 3 characters.';
    if (val.length > 50) return 'Name cannot exceed 50 characters.';
    if (!/^[a-zA-Z0-9-]+$/.test(val)) return 'Only letters, numbers, and hyphens allowed.';
    return '';
  };

  const handleClone = async () => {
    if (!selectedVM) return;
    const err = validateName(cloneName);
    if (err) { setNameError(err); return; }

    setCloning(true);
    try {
      const { jobId } = await cloneVM(selectedVM._id, cloneName);
      addToast('success', `Clone job started for "${cloneName}". Redirecting to job tracker…`);
      onSuccess(jobId);
      onClose();
    } catch (e) {
      addToast('error', e instanceof ApiError ? e.message : 'Clone failed. Please try again.');
    } finally {
      setCloning(false);
    }
  };

  const sourceIsRunning = selectedVM?.status === 'running';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Clone VM</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Step 1 — Select source VM */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select source VM
            </label>
            {loadingVMs ? (
              <div className="h-36 flex items-center justify-center text-sm text-gray-400">Loading VMs…</div>
            ) : vmError ? (
              <p className="text-sm text-red-500">{vmError}</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or VM ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
                  {filteredVMs.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No VMs found.</p>
                  ) : (
                    filteredVMs.map((vm) => (
                      <button
                        key={vm._id}
                        onClick={() => setSelectedVM(vm)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition ${
                          selectedVM?._id === vm._id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{vm.name}</p>
                          <p className="text-xs text-gray-400 font-mono">#{vm.vmid} · {vm.node}</p>
                        </div>
                        <VMStatusBadge status={vm.status as VMStatus} />
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Warning if source is running */}
          {sourceIsRunning && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                This VM is currently running. It will be stopped temporarily during cloning and restarted automatically.
              </p>
            </div>
          )}

          {/* Step 2 — Clone name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="clone-name">
              Clone name
            </label>
            <input
              id="clone-name"
              type="text"
              placeholder="e.g. my-vm-clone"
              value={cloneName}
              onChange={(e) => {
                setCloneName(e.target.value);
                if (nameError) setNameError(validateName(e.target.value));
              }}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                nameError ? 'border-red-300' : 'border-gray-200'
              }`}
            />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
            <p className="text-xs text-gray-400 mt-1">Letters, numbers, and hyphens only. 3–50 characters.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={cloning}
            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleClone()}
            disabled={!selectedVM || !cloneName || cloning}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cloning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Cloning…
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Clone VM
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CloneVMsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const { vms, loading, error, refetch } = useClonedVMs(isAuthenticated);
  const [showModal, setShowModal] = useState(false);
  const { toasts, addToast, dismiss } = useToast();

  const handleCloneSuccess = (jobId: string) => {
    refetch();
    router.push(`/dashboard/admin/jobs/${jobId}`);
  };

  return (
    <div className="max-w-screen-xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {showModal && (
        <CloneVMModal
          onClose={() => setShowModal(false)}
          onSuccess={handleCloneSuccess}
          addToast={addToast}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clone VMs</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Loading…' : `${vms.length} cloned VM${vms.length !== 1 ? 's' : ''}`}
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
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
          >
            <Copy className="w-4 h-4" />
            Clone VM
          </button>
        </div>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {!error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Cloned Virtual Machines</p>
          </div>

          {loading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : vms.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Copy className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">No cloned VMs yet</p>
              <p className="text-gray-400 text-sm mt-1">Clone an existing VM to get started.</p>
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                <Copy className="w-4 h-4" />
                Clone VM
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">VM</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cloned From</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Node</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">CPU</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">RAM</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Disk</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cloned At</th>
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm, i) => (
                    <tr
                      key={vm._id}
                      className={`border-b border-gray-50 transition-colors ${
                        i % 2 !== 0 ? 'bg-gray-50/40 hover:bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <Link href={`/dashboard/admin/vms/${vm._id}`} className="block">
                          <p className="font-medium text-gray-900 hover:text-blue-600 transition-colors">{vm.name}</p>
                          <p className="text-xs text-gray-400 font-mono">#{vm.vmid} · {vm.templateName}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="text-sm text-gray-700 font-medium">
                            {vm.sourceVmName ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><VMStatusBadge status={vm.status as VMStatus} /></td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{vm.node}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedCpu} vCPU</td>
                      <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedMemoryGb} GB</td>
                      <td className="px-4 py-3.5 text-xs text-gray-600">{vm.allocatedDiskGb} GB</td>
                      <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">{vm.ipAddress ?? '—'}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">
                        {new Date(vm.createdAt).toLocaleDateString()}
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
