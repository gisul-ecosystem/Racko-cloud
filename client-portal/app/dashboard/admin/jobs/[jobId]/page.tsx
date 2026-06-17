'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useJobStatus } from '../../../../../hooks/useJobStatus';
import {
  ChevronLeft, CheckCircle, XCircle, Clock, Loader2,
  KeyRound, Eye, EyeOff, Copy, Check as CheckIcon, AlertTriangle, Ban,
} from 'lucide-react';
import type { JobStatus, JobVMCredential } from '../../../../../lib/vmApi';

const statusConfig: Record<JobStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:     { label: 'Pending',     color: 'text-gray-500',   icon: <Clock className="w-4 h-4" /> },
  processing:  { label: 'Processing',  color: 'text-blue-600',   icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  completed:   { label: 'Completed',   color: 'text-green-600',  icon: <CheckCircle className="w-4 h-4" /> },
  partial:     { label: 'Partial',     color: 'text-yellow-600', icon: <CheckCircle className="w-4 h-4" /> },
  failed:      { label: 'Failed',      color: 'text-red-600',    icon: <XCircle className="w-4 h-4" /> },
  cancelling:  { label: 'Cancelling…', color: 'text-orange-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  cancelled:   { label: 'Cancelled',   color: 'text-gray-500',   icon: <Ban className="w-4 h-4" /> },
};

function JobCredentialsTable({ vms }: { vms: JobVMCredential[] }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRow, setCopiedRow] = useState<string | null>(null);

  async function copy(text: string, onDone: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      onDone();
    } catch {
      // Clipboard unavailable (insecure context) — silently ignore
    }
  }

  function copyAll() {
    const csv = vms
      .map((v) => `${v.name},${v.consoleUsername ?? ''},${v.consolePassword ?? ''}`)
      .join('\n');
    void copy(csv, () => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-gray-400" /> VM Credentials
        </h2>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          title="Copy all as CSV (VMName,Username,Password)"
        >
          {copiedAll ? <CheckIcon className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          Copy All
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="py-2 pr-3 font-medium">VM Name</th>
              <th className="py-2 pr-3 font-medium">Username</th>
              <th className="py-2 pr-3 font-medium">Password</th>
              <th className="py-2 font-medium text-right">Copy</th>
            </tr>
          </thead>
          <tbody>
            {vms.map((v) => {
              const isRevealed = revealed[v.id] ?? false;
              const rowCsv = `${v.name},${v.consoleUsername ?? ''},${v.consolePassword ?? ''}`;
              return (
                <tr key={v.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-3 font-medium text-gray-800">{v.name}</td>
                  <td className="py-2 pr-3 font-mono text-gray-700">{v.consoleUsername || '—'}</td>
                  <td className="py-2 pr-3 font-mono text-gray-700">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">
                        {v.consolePassword ? (isRevealed ? v.consolePassword : '••••••••') : '—'}
                      </span>
                      {v.consolePassword && (
                        <button
                          type="button"
                          onClick={() => setRevealed((r) => ({ ...r, [v.id]: !isRevealed }))}
                          className="text-gray-400 hover:text-gray-600 shrink-0"
                          title={isRevealed ? 'Hide password' : 'Show password'}
                          aria-label={isRevealed ? 'Hide password' : 'Show password'}
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        void copy(rowCsv, () => {
                          setCopiedRow(v.id);
                          setTimeout(() => setCopiedRow((c) => (c === v.id ? null : c)), 1500);
                        })
                      }
                      className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition"
                      title="Copy this VM's credentials"
                      aria-label="Copy credentials"
                    >
                      {copiedRow === v.id ? <CheckIcon className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Store these credentials safely. They are accessible from the VM details page.
        </p>
      </div>
    </div>
  );
}

export default function JobStatusPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { job, vms, loading, error, cancelling, cancel } = useJobStatus(jobId ?? null);

  if (loading && !job) {
    return (
      <div className="max-w-2xl">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="bg-white border border-gray-200 rounded-xl p-8 animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
          <div className="h-3 w-full bg-gray-100 rounded-full" />
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-2xl">
        <Link href="/dashboard/admin/vms" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ChevronLeft className="w-4 h-4" /> Back to VMs
        </Link>
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500">{error ?? 'Job not found.'}</p>
        </div>
      </div>
    );
  }

  const cfg = statusConfig[job.status];
  const pct = job.total > 0 ? Math.round(((job.completed + job.failed) / job.total) * 100) : 0;
  const isTerminal = ['completed', 'partial', 'failed', 'cancelled'].includes(job.status);
  const isCancellable = ['pending', 'processing'].includes(job.status) &&
    ['bulk_create', 'bulk_delete', 'vm_clone'].includes(job.type);

  return (
    <div className="max-w-2xl">
      <Link href="/dashboard/admin/vms" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
        <ChevronLeft className="w-4 h-4" /> Back to VMs
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {job.type === 'bulk_delete' ? 'Bulk Delete Job' : job.type === 'vm_clone' ? 'VM Clone Job' : 'Bulk Job'}
        </h1>
        <p className="text-gray-400 text-sm font-mono mt-0.5">{job._id}</p>
      </div>

      {/* Status card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between mb-5">
          <div className={`flex items-center gap-2 font-semibold text-sm ${cfg.color}`}>
            {cfg.icon}
            {cfg.label}
          </div>
          <div className="flex items-center gap-3">
            {isCancellable && (
              <button
                onClick={() => void cancel()}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Ban className="w-3.5 h-3.5" />
                {cancelling ? 'Cancelling…' : 'Cancel Job'}
              </button>
            )}
            {!isTerminal && (
              <span className="text-xs text-gray-400 animate-pulse">Auto-refreshing every 3s…</span>
            )}
          </div>
        </div>

        {job.phase === 'building_golden_image' && !isTerminal && (
          <p className="text-xs text-blue-600 mb-4">
            Building software image — cloning will begin once the golden template is ready.
          </p>
        )}

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>{job.completed + job.failed} of {job.total} processed</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                job.status === 'failed' ? 'bg-red-500' :
                job.status === 'partial' ? 'bg-yellow-500' :
                'bg-blue-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-xl font-bold text-green-700">{job.completed}</p>
            <p className="text-xs text-green-600 mt-0.5">{job.type === 'bulk_delete' ? 'Deleted' : 'Succeeded'}</p>          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-xl font-bold text-red-700">{job.failed}</p>
            <p className="text-xs text-red-600 mt-0.5">Failed</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-xl font-bold text-gray-700">{job.pending}</p>
            <p className="text-xs text-gray-500 mt-0.5">Pending</p>
          </div>
        </div>
      </div>

      {/* Specs */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Job Details</h2>
        <div className="grid grid-cols-2 gap-2">
          {(job.type === 'bulk_delete'
            ? [
                { label: 'Operation', value: 'Delete VMs' },
                { label: 'Total VMs', value: job.total },
                { label: 'Started', value: new Date(job.startedAt).toLocaleString() },
                ...(job.completedAt ? [{ label: 'Completed', value: new Date(job.completedAt).toLocaleString() }] : []),
                ...(job.cancelledAt ? [{ label: 'Cancelled', value: new Date(job.cancelledAt).toLocaleString() }] : []),
              ]
            : job.type === 'vm_clone'
            ? [
                { label: 'Clone Name', value: job.requestedSpecs?.namePrefix ?? '—' },
                { label: 'Source VM', value: (job.requestedSpecs as { sourceVmName?: string })?.sourceVmName ?? '—' },
                { label: 'Count', value: job.requestedSpecs?.count ?? job.total },
                { label: 'CPU', value: `${job.requestedSpecs?.cpuCores ?? '—'} vCPU` },
                { label: 'RAM', value: `${job.requestedSpecs?.memoryGb ?? '—'} GB` },
                { label: 'Disk', value: `${job.requestedSpecs?.diskGb ?? '—'} GB` },
                { label: 'Started', value: new Date(job.startedAt).toLocaleString() },
                ...(job.completedAt ? [{ label: 'Completed', value: new Date(job.completedAt).toLocaleString() }] : []),
                ...(job.cancelledAt ? [{ label: 'Cancelled', value: new Date(job.cancelledAt).toLocaleString() }] : []),
              ]
            : [
                { label: 'Template', value: job.requestedSpecs?.templateName ?? '—' },
                { label: 'Name Prefix', value: job.requestedSpecs?.namePrefix ?? '—' },
                { label: 'Count', value: job.requestedSpecs?.count ?? job.total },
                { label: 'Clone Type', value: job.requestedSpecs?.cloneType === 'dedicated_storage' ? 'Dedicated' : 'Dynamic' },
                { label: 'CPU', value: `${job.requestedSpecs?.cpuCores ?? '—'} vCPU` },
                { label: 'RAM', value: `${job.requestedSpecs?.memoryGb ?? '—'} GB` },
                { label: 'Disk', value: `${job.requestedSpecs?.diskGb ?? '—'} GB` },
                { label: 'Started', value: new Date(job.startedAt).toLocaleString() },
                ...(job.completedAt ? [{ label: 'Completed', value: new Date(job.completedAt).toLocaleString() }] : []),
                ...(job.cancelledAt ? [{ label: 'Cancelled', value: new Date(job.cancelledAt).toLocaleString() }] : []),
              ]
          ).map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-400">{label}</span>
              <span className="text-xs text-gray-700">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* VM credentials — create jobs only */}
      {job.type !== 'bulk_delete' && job.type !== 'vm_clone' && vms.length > 0 && (job.status === 'completed' || job.completed > 0) && (
        <JobCredentialsTable vms={vms} />
      )}

      {/* Errors */}
      {job.jobErrors.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Failed VMs <span className="text-red-500">({job.jobErrors.length})</span>
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {job.jobErrors.map((e, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800">{e.vmName}</p>
                  <p className="text-xs text-red-600 mt-0.5">{e.error}</p>
                  {e.node && <p className="text-xs text-gray-400 mt-0.5">Node: {e.node}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion summary */}
      {job.vmIds.length > 0 && isTerminal && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-green-700">
            <strong>{job.vmIds.length}</strong> VM{job.vmIds.length !== 1 ? 's' : ''}{' '}
            {job.type === 'bulk_delete' ? 'deleted' : job.type === 'vm_clone' ? 'cloned' : 'created'} successfully.
          </p>
          <Link
            href="/dashboard/admin/vms"
            className="text-xs font-medium text-green-700 hover:text-green-800 underline"
          >
            View VMs →
          </Link>
        </div>
      )}
    </div>
  );
}
