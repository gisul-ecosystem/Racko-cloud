'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { fetchMyJobs, type IVMJob, type JobStatus } from '../../../../lib/vmApi';
import { ApiError } from '../../../../lib/apiClient';
import { CheckCircle, XCircle, Clock, Loader2, Plus, Briefcase, RefreshCw, Ban } from 'lucide-react';

function getJobSummary(job: IVMJob): { title: string; subtitle: string } {
  if (job.type === 'bulk_delete') {
    return {
      title: `Delete ${job.total} VMs`,
      subtitle: 'Bulk delete job',
    };
  }

  if (job.type === 'vm_clone') {
    return {
      title: job.requestedSpecs?.namePrefix ?? 'VM Clone',
      subtitle: 'VM clone job',
    };
  }

  return {
    title: `${job.requestedSpecs?.namePrefix ?? 'vm'}-*`,
    subtitle: `${job.requestedSpecs?.count ?? job.total} VMs · ${job.requestedSpecs?.templateName ?? 'Unknown template'}`,
  };
}

const statusConfig: Record<JobStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:     { label: 'Pending',     color: 'text-gray-500',   icon: <Clock className="w-3.5 h-3.5" /> },
  processing:  { label: 'Processing',  color: 'text-blue-600',   icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  completed:   { label: 'Completed',   color: 'text-green-600',  icon: <CheckCircle className="w-3.5 h-3.5" /> },
  partial:     { label: 'Partial',     color: 'text-yellow-600', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  failed:      { label: 'Failed',      color: 'text-red-600',    icon: <XCircle className="w-3.5 h-3.5" /> },
  cancelling:  { label: 'Cancelling…', color: 'text-orange-500', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  cancelled:   { label: 'Cancelled',   color: 'text-gray-400',   icon: <XCircle className="w-3.5 h-3.5" /> },
};

export default function JobsListPage() {
  const { isAuthenticated } = useAuth();
  const [jobs, setJobs] = useState<IVMJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMyJobs(20);
      setJobs(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500 ? 'Service temporarily unavailable.' : err.message
          : 'Failed to load jobs.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Jobs</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Loading…' : `${jobs.length} recent job${jobs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/dashboard/admin/vms/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create VM
          </Link>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <button onClick={load} className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium">
              Retry
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm font-medium">No bulk jobs yet</p>
            <p className="text-gray-400 text-xs mt-1">
              Jobs appear here when you create more than 1 VM at once.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {jobs.map((job) => {
              const cfg = statusConfig[job.status];
              const summary = getJobSummary(job);
              const pct = job.total > 0
                ? Math.round(((job.completed + job.failed) / job.total) * 100)
                : 0;
              return (
                <Link
                  key={job._id}
                  href={`/dashboard/admin/jobs/${job._id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className={`flex items-center gap-1.5 text-xs font-medium w-24 shrink-0 ${cfg.color}`}>
                    {cfg.icon}
                    {cfg.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {summary.title}{' '}
                      <span className="text-gray-400 font-normal text-xs">
                        {summary.subtitle}
                      </span>
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                        <div
                          className={`h-full rounded-full ${
                            job.status === 'failed' ? 'bg-red-500' :
                            job.status === 'partial' ? 'bg-yellow-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">
                        {job.completed}/{job.total} done
                        {job.failed > 0 && (
                          <span className="text-red-500"> · {job.failed} failed</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(job.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
