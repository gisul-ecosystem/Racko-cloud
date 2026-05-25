'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useJobStatus } from '../../../../../hooks/useJobStatus';
import { ChevronLeft, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import type { JobStatus } from '../../../../../lib/vmApi';

const statusConfig: Record<JobStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pending',    color: 'text-gray-500',  icon: <Clock className="w-4 h-4" /> },
  processing: { label: 'Processing', color: 'text-blue-600',  icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  completed:  { label: 'Completed',  color: 'text-green-600', icon: <CheckCircle className="w-4 h-4" /> },
  partial:    { label: 'Partial',    color: 'text-yellow-600',icon: <CheckCircle className="w-4 h-4" /> },
  failed:     { label: 'Failed',     color: 'text-red-600',   icon: <XCircle className="w-4 h-4" /> },
};

export default function JobStatusPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { job, loading, error } = useJobStatus(jobId ?? null);

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
  const isTerminal = ['completed', 'partial', 'failed'].includes(job.status);

  return (
    <div className="max-w-2xl">
      <Link href="/dashboard/admin/vms" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
        <ChevronLeft className="w-4 h-4" /> Back to VMs
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Job</h1>
        <p className="text-gray-400 text-sm font-mono mt-0.5">{job._id}</p>
      </div>

      {/* Status card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between mb-5">
          <div className={`flex items-center gap-2 font-semibold text-sm ${cfg.color}`}>
            {cfg.icon}
            {cfg.label}
          </div>
          {!isTerminal && (
            <span className="text-xs text-gray-400 animate-pulse">Auto-refreshing every 3s…</span>
          )}
        </div>

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
            <p className="text-xs text-green-600 mt-0.5">Succeeded</p>
          </div>
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
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Job Specs</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Template', value: job.requestedSpecs.templateName },
            { label: 'Name Prefix', value: job.requestedSpecs.namePrefix },
            { label: 'Count', value: job.requestedSpecs.count },
            { label: 'Clone Type', value: job.requestedSpecs.cloneType === 'dedicated_storage' ? 'Dedicated' : 'Dynamic' },
            { label: 'CPU', value: `${job.requestedSpecs.cpuCores} vCPU` },
            { label: 'RAM', value: `${job.requestedSpecs.memoryGb} GB` },
            { label: 'Disk', value: `${job.requestedSpecs.diskGb} GB` },
            { label: 'Started', value: new Date(job.startedAt).toLocaleString() },
            ...(job.completedAt ? [{ label: 'Completed', value: new Date(job.completedAt).toLocaleString() }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-400">{label}</span>
              <span className="text-xs text-gray-700">{value}</span>
            </div>
          ))}
        </div>
      </div>

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

      {/* Created VMs link */}
      {job.vmIds.length > 0 && isTerminal && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-green-700">
            <strong>{job.vmIds.length}</strong> VM{job.vmIds.length !== 1 ? 's' : ''} created successfully.
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
