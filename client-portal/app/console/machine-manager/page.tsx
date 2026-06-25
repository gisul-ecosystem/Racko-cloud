'use client';

import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { useMachines } from '../../../hooks/useMachines';
import { useInstallJobs } from '../../../hooks/useInstallJobs';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { Monitor, Server, Wand2, RefreshCw } from 'lucide-react';
import type { MachineStatus, JobStatus } from '../../../lib/machineManagerApi';

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

export default function MachineManagerOverviewPage() {
  const { isAuthenticated } = useAuth();
  const { machines, loading: machinesLoading, error: machinesError, refetch: refetchMachines } = useMachines(isAuthenticated);
  const { jobs, loading: jobsLoading, error: jobsError, refetch: refetchJobs } = useInstallJobs(isAuthenticated);

  const recentJobs = jobs.slice(0, 5);

  return (
    <div className="max-w-screen-xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Machine Manager</h1>
          <p className="mt-0.5 text-sm text-gray-500">Overview of your machines and recent jobs</p>
        </div>
        <Link
          href="/console/machine-manager/setup"
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717]"
        >
          <Wand2 className="h-4 w-4" />
          Setup Wizard
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Machines', value: machines.length, icon: Server },
          { label: 'Online', value: machines.filter((m) => m.status === 'online').length, icon: Monitor },
          { label: 'Total Jobs', value: jobs.length, icon: RefreshCw },
          { label: 'Active Jobs', value: jobs.filter((j) => j.status === 'installing' || j.status === 'pending').length, icon: RefreshCw },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
                <Icon className="h-4 w-4 text-[#B91C1C]" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{machinesLoading || jobsLoading ? '—' : value}</p>
          </div>
        ))}
      </div>

      {/* Machines table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Machines</h2>
          <button
            onClick={refetchMachines}
            disabled={machinesLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${machinesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {machinesError && !machinesLoading ? (
          <ErrorState title="Failed to load machines" message={machinesError} onRetry={refetchMachines} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {machinesLoading ? (
              <TableSkeleton rows={4} cols={4} />
            ) : machines.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <Server className="h-6 w-6 text-gray-400" />
                </div>
                <p className="font-medium text-gray-600">No machines added yet</p>
                <p className="mt-1 text-sm text-gray-400">Use the Setup Wizard to add your first machine.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Name', 'IP Address', 'OS', 'Status'].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {machines.slice(0, 5).map((m, i) => (
                      <tr key={m._id} className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-5 py-3 font-medium text-gray-900">{m.name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{m.ipAddress}</td>
                        <td className="px-5 py-3 capitalize text-gray-600">{m.os}</td>
                        <td className="px-5 py-3"><MachineStatusBadge status={m.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {machines.length > 5 && (
          <div className="mt-2 text-right">
            <Link href="/console/machine-manager/machines" className="text-xs text-[#B91C1C] hover:underline">
              View all {machines.length} machines →
            </Link>
          </div>
        )}
      </div>

      {/* Recent jobs table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Jobs</h2>
          <button
            onClick={refetchJobs}
            disabled={jobsLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${jobsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {jobsError && !jobsLoading ? (
          <ErrorState title="Failed to load jobs" message={jobsError} onRetry={refetchJobs} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {jobsLoading ? (
              <TableSkeleton rows={3} cols={4} />
            ) : recentJobs.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-gray-400">No jobs yet. Run the Setup Wizard to install software.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Machine', 'Status', 'Attempts', 'Last Updated'].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentJobs.map((j, i) => (
                      <tr key={j._id} className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{j.machineId}</td>
                        <td className="px-5 py-3"><JobStatusBadge status={j.status} /></td>
                        <td className="px-5 py-3 text-gray-600">{j.attempts}</td>
                        <td className="px-5 py-3 text-gray-400">{new Date(j.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {jobs.length > 5 && (
          <div className="mt-2 text-right">
            <Link href="/console/machine-manager/jobs" className="text-xs text-[#B91C1C] hover:underline">
              View all {jobs.length} jobs →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
