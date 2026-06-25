'use client';

import { useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useInstallJobs } from '../../../../hooks/useInstallJobs';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { type IJob, type JobStatus } from '../../../../lib/machineManagerApi';
import { Briefcase, RefreshCw, X, FileText } from 'lucide-react';

function JobStatusBadge({ status }: { status: JobStatus }) {
  const cfg: Record<JobStatus, { label: string; dot: string; badge: string }> = {
    pending:    { label: 'Pending',    dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-500 border-gray-200' },
    installing: { label: 'Installing', dot: 'bg-blue-400',   badge: 'bg-blue-100 text-blue-700 border-blue-200' },
    success:    { label: 'Success',    dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700 border-green-200' },
    failed:     { label: 'Failed',     dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200' },
    retrying:   { label: 'Retrying',   dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${c.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function LogsModal({ job, onClose }: { job: IJob; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Job Logs</p>
            <p className="mt-0.5 font-mono text-xs text-gray-400">{job._id}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status + attempts */}
        <div className="flex items-center gap-4 border-b border-gray-100 px-5 py-3">
          <JobStatusBadge status={job.status} />
          <span className="text-xs text-gray-400">{job.attempts} attempt{job.attempts !== 1 ? 's' : ''}</span>
        </div>

        {/* Logs */}
        <div className="max-h-[400px] overflow-y-auto p-5">
          {job.logs ? (
            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-gray-700">
              {job.logs}
            </pre>
          ) : (
            <p className="text-sm text-gray-400">No logs available for this job.</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const { isAuthenticated } = useAuth();
  const { jobs, loading, error, refetch } = useInstallJobs(isAuthenticated);
  const [selectedJob, setSelectedJob] = useState<IJob | null>(null);

  return (
    <div className="max-w-screen-xl">
      {selectedJob && <LogsModal job={selectedJob} onClose={() => setSelectedJob(null)} />}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs &amp; Status</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Loading…' : `${jobs.length} job${jobs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && !loading && (
        <ErrorState title="Failed to load jobs" message={error} onRetry={refetch} />
      )}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : jobs.length === 0 ? (
            <div className="p-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <Briefcase className="h-7 w-7 text-gray-400" />
              </div>
              <p className="font-medium text-gray-600">No jobs yet</p>
              <p className="mt-1 text-sm text-gray-400">Run the Setup Wizard to install software on your machines.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Machine ID', 'Packages', 'Status', 'Attempts', 'Logs', 'Created', 'Updated'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j, i) => (
                    <tr key={j._id} className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-5 py-3 font-mono text-xs text-gray-600">{j.machineId}</td>
                      <td className="px-5 py-3 text-gray-600">{j.softwareIds.length}</td>
                      <td className="px-5 py-3"><JobStatusBadge status={j.status} /></td>
                      <td className="px-5 py-3 text-gray-600">{j.attempts}</td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setSelectedJob(j)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 transition hover:bg-gray-50"
                        >
                          <FileText className="h-3 w-3" />
                          {j.logs ? 'View logs' : 'No logs'}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400">{new Date(j.createdAt).toLocaleString()}</td>
                      <td className="px-5 py-3 text-xs text-gray-400">{new Date(j.updatedAt).toLocaleString()}</td>
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
