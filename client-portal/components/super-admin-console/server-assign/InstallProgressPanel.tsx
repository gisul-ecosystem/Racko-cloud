'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Package, XCircle } from 'lucide-react';
import { useJobStream } from '@/hooks/useJobStream';
import type { IJob, ISoftwareCatalog, JobStatus } from '@/lib/machineManagerApi';
import type { InstallSoftwareResult } from '@/lib/vmInventoryApi';

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'Queued',
  installing: 'Installing',
  retrying: 'Retrying',
  success: 'Installed',
  failed: 'Failed',
};

const STATUS_TONE: Record<JobStatus, string> = {
  pending: 'text-gray-400',
  installing: 'text-blue-600',
  retrying: 'text-amber-600',
  success: 'text-emerald-600',
  failed: 'text-rose-600',
};

/**
 * Headless subscriber: one SSE stream per job, exactly as the Machine Manager
 * machines table does it. Hooks can't run in a loop, so each job gets its own
 * component instance that pushes updates back up.
 */
function JobStreamSubscriber({
  job,
  isAuthenticated,
  onUpdate,
}: {
  job: IJob;
  isAuthenticated: boolean;
  onUpdate: (job: IJob) => void;
}) {
  const live = useJobStream(job, isAuthenticated);
  useEffect(() => {
    onUpdate(live);
  }, [live, onUpdate]);
  return null;
}

/**
 * Live view of the install jobs queued by an assignment batch, grouped by VM.
 * Jobs are owned by the super admin who started them, so their streams are
 * readable from here without leaving the assign flow.
 */
export function InstallProgressPanel({
  result,
  catalog,
  isAuthenticated,
}: {
  result: InstallSoftwareResult;
  catalog: ISoftwareCatalog[];
  isAuthenticated: boolean;
}) {
  const [jobs, setJobs] = useState<IJob[]>(result.jobs);

  useEffect(() => {
    setJobs(result.jobs);
  }, [result.jobs]);

  const updateJob = useCallback((updated: IJob) => {
    setJobs((prev) => {
      const i = prev.findIndex((j) => j._id === updated._id);
      if (i === -1 || prev[i] === updated) return prev;
      const next = [...prev];
      next[i] = updated;
      return next;
    });
  }, []);

  const softwareName = useCallback(
    (job: IJob) =>
      job.softwareName ||
      catalog.find((s) => s._id === job.softwareIds[0])?.name ||
      'Software',
    [catalog]
  );

  const machineName = useMemo(
    () => new Map(result.targets.map((t) => [t.machineId, t])),
    [result.targets]
  );

  /** Grouped by VM so an operator reads it the same way they picked the VMs. */
  const byMachine = useMemo(() => {
    const groups = new Map<string, IJob[]>();
    for (const job of jobs) {
      const list = groups.get(job.machineId);
      if (list) list.push(job);
      else groups.set(job.machineId, [job]);
    }
    return [...groups.entries()];
  }, [jobs]);

  const counts = {
    success: jobs.filter((j) => j.status === 'success').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    running: jobs.filter((j) => j.status === 'installing' || j.status === 'retrying').length,
    pending: jobs.filter((j) => j.status === 'pending').length,
  };

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5">
      {jobs.map((job) => (
        <JobStreamSubscriber
          key={job._id}
          job={job}
          isAuthenticated={isAuthenticated}
          onUpdate={updateJob}
        />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Package className="h-4 w-4 text-gray-400" />
          Software installs
        </h2>
        <span className="text-xs text-gray-500">
          {jobs.length} job{jobs.length === 1 ? '' : 's'} on {byMachine.length} VM
          {byMachine.length === 1 ? '' : 's'}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {counts.success > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {counts.success} installed
            </span>
          )}
          {counts.running + counts.pending > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 ring-1 ring-blue-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {counts.running + counts.pending} in progress
            </span>
          )}
          {counts.failed > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700 ring-1 ring-rose-200">
              <XCircle className="h-3.5 w-3.5" />
              {counts.failed} failed
            </span>
          )}
        </span>
      </div>

      {result.notManaged.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Skipped {result.notManaged.length} VM{result.notManaged.length === 1 ? '' : 's'} with no
            Racko agent installed: {result.notManaged.join(', ')}
          </span>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {byMachine.map(([machineId, machineJobs]) => {
          const target = machineName.get(machineId);
          return (
            <div key={machineId} className="rounded-lg border border-gray-100">
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
                <span className="font-mono text-xs text-gray-900">
                  {target?.ipAddress ?? machineId}
                </span>
                {target && <span className="text-xs text-gray-500">{target.machineName}</span>}
                {target && !target.online && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                    agent offline — runs on reconnect
                  </span>
                )}
              </div>
              <ul className="divide-y divide-gray-100">
                {machineJobs.map((job) => (
                  <li key={job._id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700">{softwareName(job)}</span>
                      <span
                        className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${STATUS_TONE[job.status]}`}
                      >
                        {(job.status === 'installing' || job.status === 'retrying') && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {STATUS_LABEL[job.status]}
                      </span>
                    </div>
                    {job.status === 'failed' && job.logs && (
                      <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px] text-gray-600">
                        {job.logs}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
