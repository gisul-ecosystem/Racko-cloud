'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useMachines } from '../../../../hooks/useMachines';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import {
  deleteMachine, fetchJobs,
  type IMachine, type MachineStatus, type IJob, type JobStatus,
} from '../../../../lib/machineManagerApi';
import { ApiError } from '../../../../lib/apiClient';
import { Server, RefreshCw, Trash2, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

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

// ─── Software Progress cell ────────────────────────────────────────────────────
const COLLAPSE_THRESHOLD = 3;

function SoftwareProgress({ jobs }: { jobs: IJob[] }) {
  const [expanded, setExpanded] = useState(false);

  if (jobs.length === 0) return <span className="text-xs text-gray-400">—</span>;

  const counts = {
    success:    jobs.filter((j) => j.status === 'success').length,
    failed:     jobs.filter((j) => j.status === 'failed').length,
    installing: jobs.filter((j) => j.status === 'installing' || j.status === 'retrying').length,
    pending:    jobs.filter((j) => j.status === 'pending').length,
  };

  const visible = expanded ? jobs : jobs.slice(0, COLLAPSE_THRESHOLD);
  const hasMore = jobs.length > COLLAPSE_THRESHOLD;

  return (
    <div className="min-w-[160px]">
      {/* Summary chips */}
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

      {/* Per-software list */}
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

      {/* Expand / collapse toggle */}
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

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function MyMachinesPage() {
  const { isAuthenticated } = useAuth();
  const { machines, loading, error, refetch } = useMachines(isAuthenticated);
  const { toasts, addToast, dismiss } = useToast();

  const [pendingDelete, setPendingDelete] = useState<IMachine | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Jobs keyed by machineId — fetched once, refreshed with machines
  const [jobsByMachine, setJobsByMachine] = useState<Record<string, IJob[]>>({});

  const loadJobs = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const jobs = await fetchJobs();
      // Group by machineId, keep most recent job per software (by createdAt desc)
      const grouped: Record<string, IJob[]> = {};
      for (const job of jobs) {
        if (!grouped[job.machineId]) grouped[job.machineId] = [];
        grouped[job.machineId].push(job);
      }
      setJobsByMachine(grouped);
    } catch { /* non-fatal */ }
  }, [isAuthenticated]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs, machines]); // re-group whenever machines refresh

  const handleRefresh = () => {
    refetch();
    void loadJobs();
  };

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
            <TableSkeleton rows={5} cols={6} />
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
                    {['Name', 'IP Address', 'OS', 'Status', 'Software Progress', 'Last Seen', 'Actions'].map((h) => (
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
                      <td className="px-5 py-3">
                        <SoftwareProgress jobs={jobsByMachine[m._id] ?? []} />
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
