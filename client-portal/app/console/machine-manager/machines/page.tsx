'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useMachines } from '../../../../hooks/useMachines';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import {
  deleteMachine, fetchJobs, resetMachines, issueResetStreamTicket, openResetStatusStream,
  setMachineTracking, bulkDeleteMachines,
  type IMachine, type MachineStatus, type IJob, type JobStatus,
} from '../../../../lib/machineManagerApi';
import { ApiError } from '../../../../lib/apiClient';
import { useJobStream } from '../../../../hooks/useJobStream';
import {
  Server, RefreshCw, Trash2, Eye, ChevronDown, ChevronUp,
  RotateCcw, CheckCircle2, XCircle, Loader2, X, Activity,
} from 'lucide-react';
import Link from 'next/link';

// ─── Tracking badge ────────────────────────────────────────────────────────────
function TrackingBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
        <Activity className="h-3 w-3" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-400">
      Off
    </span>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────────
function MachineStatusBadge({ status }: { status: MachineStatus }) {
  const cfg: Record<MachineStatus, { label: string; dot: string; badge: string }> = {
    pending: { label: 'Pending', dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-500 border-gray-200' },
    online:  { label: 'Online',  dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 border-green-200' },
    offline: { label: 'Offline', dot: 'bg-red-400',   badge: 'bg-red-50 text-red-600 border-red-200' },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${c.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Per-job dot ───────────────────────────────────────────────────────────────
const jobDot: Record<JobStatus, string> = {
  pending:    'bg-gray-400',
  installing: 'bg-blue-400',
  success:    'bg-green-500',
  failed:     'bg-red-500',
  retrying:   'bg-yellow-400',
};
const jobLabel: Record<JobStatus, string> = {
  pending:    'Pending',
  installing: 'Installing',
  success:    'Success',
  failed:     'Failed',
  retrying:   'Retrying',
};

// ─── Live job wrapper ─────────────────────────────────────────────────────────
function LiveJobRow({ job, isAuthenticated, onUpdate }: {
  job: IJob; isAuthenticated: boolean; onUpdate: (updated: IJob) => void;
}) {
  const live = useJobStream(job, isAuthenticated);
  useEffect(() => { onUpdate(live); }, [live.status, live.logs]);
  return null;
}

// ─── Software Progress cell ────────────────────────────────────────────────────
const COLLAPSE_THRESHOLD = 3;

function SoftwareProgress({ jobs, isAuthenticated }: { jobs: IJob[]; isAuthenticated: boolean }) {
  const [liveJobs, setLiveJobs] = useState<IJob[]>(jobs);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setLiveJobs(jobs); }, [jobs]);

  const updateJob = useCallback((updated: IJob) => {
    setLiveJobs((prev) => prev.map((j) => j._id === updated._id ? updated : j));
  }, []);

  if (liveJobs.length === 0) return <span className="text-xs text-gray-400">—</span>;

  const counts = {
    success:    liveJobs.filter((j) => j.status === 'success').length,
    failed:     liveJobs.filter((j) => j.status === 'failed').length,
    installing: liveJobs.filter((j) => j.status === 'installing' || j.status === 'retrying').length,
    pending:    liveJobs.filter((j) => j.status === 'pending').length,
  };

  const visible = expanded ? liveJobs : liveJobs.slice(0, COLLAPSE_THRESHOLD);
  const hasMore = liveJobs.length > COLLAPSE_THRESHOLD;

  return (
    <div className="min-w-[160px]">
      {liveJobs.map((j) => (
        <LiveJobRow key={j._id} job={j} isAuthenticated={isAuthenticated} onUpdate={updateJob} />
      ))}
      <div className="mb-1.5 flex flex-wrap gap-1">
        {counts.success > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />{counts.success} done
          </span>
        )}
        {counts.failed > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{counts.failed} failed
          </span>
        )}
        {counts.installing > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-600">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />{counts.installing} active
          </span>
        )}
        {counts.pending > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />{counts.pending} pending
          </span>
        )}
      </div>
      <div className="space-y-1">
        {visible.map((j) => (
          <div key={j._id} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${jobDot[j.status] ?? 'bg-gray-400'}`} />
            <span className="truncate text-xs text-gray-600 max-w-[120px]" title={j.softwareName || j._id}>
              {j.softwareName || '…'}
            </span>
            <span className={`ml-auto shrink-0 text-xs font-medium ${
              j.status === 'success'    ? 'text-green-600'
              : j.status === 'failed'  ? 'text-red-500'
              : j.status === 'installing' || j.status === 'retrying' ? 'text-blue-500'
              : 'text-gray-400'
            }`}>
              {jobLabel[j.status]}
            </span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-1.5 inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" /> Show less</>
            : <><ChevronDown className="h-3 w-3" /> +{jobs.length - COLLAPSE_THRESHOLD} more</>
          }
        </button>
      )}
    </div>
  );
}

// ─── Reset status types ───────────────────────────────────────────────────────
type ResetStatus = 'pending' | 'resetting' | 'success' | 'failed' | 'offline';

interface ResetMachineState {
  machineId: string;
  machineName: string;
  status: ResetStatus;
  error?: string;
}

// ─── Reset Status Modal ───────────────────────────────────────────────────────
function ResetStatusModal({
  states,
  onClose,
}: {
  states: ResetMachineState[];
  onClose: () => void;
}) {
  const allDone = states.every((s) => s.status === 'success' || s.status === 'failed' || s.status === 'offline');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Reset VM Status</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {allDone ? 'All resets completed' : 'Reset in progress — this may take a few minutes'}
            </p>
          </div>
          {allDone && (
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto p-5 space-y-3">
          {states.map((s) => (
            <div key={s.machineId} className="flex items-center gap-3 rounded-lg border border-gray-100 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                {s.status === 'resetting' || s.status === 'pending' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                ) : s.status === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : s.status === 'offline' ? (
                  <XCircle className="h-4 w-4 text-gray-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s.machineName}</p>
                <p className={`text-xs mt-0.5 ${
                  s.status === 'success' ? 'text-green-600'
                  : s.status === 'failed' ? 'text-red-500'
                  : s.status === 'offline' ? 'text-gray-400'
                  : 'text-blue-500'
                }`}>
                  {s.status === 'pending'   ? 'Queued...'
                  : s.status === 'resetting' ? 'Resetting VM...'
                  : s.status === 'success'   ? 'Reset complete'
                  : s.status === 'offline'   ? 'Agent offline — reset skipped'
                  : `Failed: ${s.error ?? 'Unknown error'}`}
                </p>
              </div>
            </div>
          ))}
        </div>
        {allDone && (
          <div className="border-t border-gray-100 px-5 py-3 text-right">
            <button
              onClick={onClose}
              className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function MyMachinesPage() {
  const { isAuthenticated } = useAuth();
  const { machines, loading, error, refetch } = useMachines(isAuthenticated);
  const { toasts, addToast, dismiss } = useToast();

  const [pendingDelete, setPendingDelete] = useState<IMachine | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Bulk delete state
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Bulk selection — any machine can be selected for tracking/reset/clone
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Tracking
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Reset confirm + status
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetStates, setResetStates] = useState<ResetMachineState[] | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Jobs keyed by machineId
  const [jobsByMachine, setJobsByMachine] = useState<Record<string, IJob[]>>({});

  const loadJobs = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const jobs = await fetchJobs();
      const grouped: Record<string, IJob[]> = {};
      for (const job of jobs) {
        if (!grouped[job.machineId]) grouped[job.machineId] = [];
        grouped[job.machineId].push(job);
      }
      setJobsByMachine(grouped);
    } catch { /* non-fatal */ }
  }, [isAuthenticated]);

  useEffect(() => { void loadJobs(); }, [loadJobs, machines]);

  // Cleanup SSE on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  const handleRefresh = () => { refetch(); void loadJobs(); };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    try {
      await deleteMachine(pendingDelete._id);
      addToast('success', `"${pendingDelete.name}" removed. Agent will uninstall within a few seconds.`);
      setPendingDelete(null);
      refetch();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to remove machine.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedMachines.length) return;
    setBulkDeleteLoading(true);
    setShowBulkDeleteConfirm(false);
    try {
      const result = await bulkDeleteMachines(selectedMachines.map((m) => m._id));

      if (result.failed.length > 0) {
        const failedNames = result.failed.map((f) => {
          const m = machines.find((machine) => machine._id === f.machineId);
          return m?.name ?? f.machineId;
        });
        addToast('error', `${result.deleted.length} deleted, ${result.failed.length} failed: ${failedNames.join(', ')}`);
      } else {
        addToast('success', `${result.deleted.length} machine(s) removed. Agents will uninstall within a few seconds.`);
      }

      setSelectedIds(new Set());
      refetch();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete machines.');
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = machines.every((m) => selectedIds.has(m._id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(machines.map((m) => m._id)));
    }
  };

  const selectedMachines = machines.filter((m) => selectedIds.has(m._id));

  const handleTracking = async (enabled: boolean) => {
    if (!selectedMachines.length) return;
    setTrackingLoading(true);
    try {
      await setMachineTracking(selectedMachines.map((m) => m._id), enabled);
      addToast('success', `Tracking ${enabled ? 'enabled' : 'disabled'} on ${selectedMachines.length} machine(s).`);
      setSelectedIds(new Set());
      refetch();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to update tracking.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleReset = async () => {
    if (!selectedMachines.length) return;
    setResetting(true);
    setShowResetConfirm(false);

    // Initialize status panel
    const initial: ResetMachineState[] = selectedMachines.map((m) => ({
      machineId: m._id,
      machineName: m.name,
      status: 'pending',
    }));
    setResetStates(initial);

    try {
      const sessionId = `reset-${Date.now()}`;
      const result = await resetMachines(selectedMachines.map((m) => m._id), sessionId);

      // Mark offline machines immediately
      setResetStates((prev) =>
        prev!.map((s) =>
          result.offline.includes(s.machineId) ? { ...s, status: 'offline' } : { ...s, status: 'resetting' }
        )
      );

      // Open SSE stream for accepted machines
      if (result.accepted.length > 0) {
        const ticket = await issueResetStreamTicket(sessionId);
        const sse = openResetStatusStream(sessionId, ticket.streamToken);
        sseRef.current = sse;

        sse.onmessage = (e: MessageEvent) => {
          const event = JSON.parse(e.data as string) as {
            type: string;
            machineId?: string;
            success?: boolean;
            error?: string;
          };

          if (event.type === 'reset_complete' && event.machineId) {
            setResetStates((prev) =>
              prev!.map((s) =>
                s.machineId === event.machineId
                  ? { ...s, status: event.success ? 'success' : 'failed', error: event.error }
                  : s
              )
            );
          }
        };

        sse.onerror = () => {
          sse.close();
          sseRef.current = null;
        };
      }

      setSelectedIds(new Set());
      // Refresh machines list after a delay so job history is cleared
      setTimeout(() => { refetch(); void loadJobs(); }, 3000);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to initiate reset.');
      setResetStates(null);
    } finally {
      setResetting(false);
    }
  };

  const onlineCount = machines.filter((m) => m.status === 'online').length;
  const allOnlineSelected = machines.length > 0 && machines.every((m) => selectedIds.has(m._id));

  return (
    <div className="max-w-screen-xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {pendingDelete && (
        <ConfirmModal
          open
          title="Remove Machine"
          description={`This will uninstall the Racko agent from "${pendingDelete.name}" and remove it from your machine list.`}
          confirmLabel="Remove Machine"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {showResetConfirm && (
        <ConfirmModal
          open
          title="Reset VM"
          description={`This will uninstall all user-installed software from ${selectedMachines.length} machine${selectedMachines.length !== 1 ? 's' : ''}. This cannot be undone.`}
          confirmLabel={`Reset ${selectedMachines.length} VM${selectedMachines.length !== 1 ? 's' : ''}`}
          confirmVariant="danger"
          loading={resetting}
          onConfirm={() => void handleReset()}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {showBulkDeleteConfirm && (
        <ConfirmModal
          open
          title="Delete Machines"
          description={`This will permanently remove ${selectedMachines.length} machine${selectedMachines.length !== 1 ? 's' : ''} and uninstall the Racko agent from ${selectedMachines.length === 1 ? 'this machine' : 'these machines'}. This cannot be undone.`}
          confirmLabel={`Delete ${selectedMachines.length} Machine${selectedMachines.length !== 1 ? 's' : ''}`}
          confirmVariant="danger"
          loading={bulkDeleteLoading}
          onConfirm={() => void handleBulkDelete()}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}

      {resetStates && (
        <ResetStatusModal
          states={resetStates}
          onClose={() => {
            sseRef.current?.close();
            sseRef.current = null;
            setResetStates(null);
          }}
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
          {selectedIds.size > 0 && (
            <>
              {/* Enable Tracking — only show if any selected machine has tracking off */}
              {selectedMachines.some((m) => !m.trackingEnabled) && (
                <button
                  onClick={() => void handleTracking(true)}
                  disabled={trackingLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50"
                >
                  {trackingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                  Enable Tracking
                </button>
              )}
              {/* Disable Tracking — only show if any selected machine has tracking on */}
              {selectedMachines.some((m) => m.trackingEnabled) && (
                <button
                  onClick={() => void handleTracking(false)}
                  disabled={trackingLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {trackingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 opacity-40" />}
                  Disable Tracking
                </button>
              )}
              {/* Clone — only enabled if all selected machines have tracking on */}
              {/* Clone button removed — clone is initiated from individual machine view */}
              {/* Reset — only for online machines */}
              {selectedMachines.some((m) => m.status === 'online') && (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={resetting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-100 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset {selectedMachines.filter((m) => m.status === 'online').length} VM{selectedMachines.filter((m) => m.status === 'online').length !== 1 ? 's' : ''}
                </button>
              )}
              {/* Bulk Delete — delete selected machines */}
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={bulkDeleteLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                {bulkDeleteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete {selectedMachines.length} Machine{selectedMachines.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
          <button
            onClick={handleRefresh}
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

      {error && !loading && <ErrorState title="Failed to load machines" message={error} onRetry={handleRefresh} />}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={5} cols={7} />
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
                    <th className="px-4 py-3 text-left">
                      {onlineCount > 0 && (
                        <input
                          type="checkbox"
                          checked={allOnlineSelected}
                          onChange={toggleSelectAll}
                          title="Select all online machines"
                          className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] cursor-pointer"
                        />
                      )}
                    </th>
                    {['Name', 'IP Address', 'OS', 'Status', 'Tracking', 'Software Progress', 'Last Seen', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {machines.map((m, i) => {
                    const isSelected = selectedIds.has(m._id);
                    const isOnline = m.status === 'online';
                    return (
                      <tr
                        key={m._id}
                        className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${i % 2 !== 0 ? 'bg-gray-50/40' : ''} ${isSelected ? 'bg-orange-50/40' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(m._id)}
                            className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] cursor-pointer"
                          />
                        </td>
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
                        <td className="px-5 py-3"><TrackingBadge enabled={m.trackingEnabled} /></td>
                        <td className="px-5 py-3">
                          <SoftwareProgress jobs={jobsByMachine[m._id] ?? []} isAuthenticated={isAuthenticated} />
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-400">
                          {m.lastSeen ? new Date(m.lastSeen).toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/console/machine-manager/machines/${m._id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Link>
                            <button
                              onClick={() => setPendingDelete(m)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
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
