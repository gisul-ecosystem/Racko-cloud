'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import type { ISoftwareCatalog } from '@/lib/machineManagerApi';
import {
  fetchInstallRun,
  fetchInstallRuns,
  type InstallRunDetail,
  type InstallRunSummary,
} from '@/lib/vmInventoryApi';
import { InstallProgressPanel } from './InstallProgressPanel';

/** Recent enough to still be worth watching, short enough to stay scannable. */
const RUN_LIMIT = 10;

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return today ? `Today ${time}` : `${date.toLocaleDateString()} ${time}`;
}

/** The run's overall state, from its job tallies. */
function runState(run: InstallRunSummary): {
  label: string;
  tone: string;
  spinning: boolean;
} {
  if (run.jobTotal === 0) return { label: 'No jobs queued', tone: 'text-gray-500', spinning: false };
  if (run.installing + run.pending > 0) {
    return {
      label: `${run.installing + run.pending} of ${run.jobTotal} in progress`,
      tone: 'text-blue-600',
      spinning: true,
    };
  }
  if (run.failed > 0) {
    return { label: `${run.failed} failed`, tone: 'text-rose-600', spinning: false };
  }
  if (run.gone === run.jobTotal) {
    return { label: 'Logs cleared', tone: 'text-gray-400', spinning: false };
  }
  return { label: `${run.success} installed`, tone: 'text-emerald-600', spinning: false };
}

/**
 * Past software installs started from this page, newest first.
 *
 * The install jobs always survived in the Machine Manager, but nothing grouped
 * them or said which assignment they belonged to — so leaving the page lost the
 * only view of them. Expanding a run refetches its jobs and reopens their live
 * streams, so a batch that was still installing picks up where it left off
 * rather than showing whatever was on screen when the tab closed.
 */
export function InstallRunHistory({
  catalog,
  isAuthenticated,
  /** Bumped by the parent after an install, to pull the new run in. */
  refreshKey,
}: {
  catalog: ISoftwareCatalog[];
  isAuthenticated: boolean;
  refreshKey: number;
}) {
  const [runs, setRuns] = useState<InstallRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InstallRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRuns(await fetchInstallRuns(RUN_LIMIT));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load past installs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const toggle = useCallback(
    async (runId: string) => {
      if (openId === runId) {
        setOpenId(null);
        setDetail(null);
        return;
      }
      setOpenId(runId);
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        setDetail(await fetchInstallRun(runId));
      } catch (err) {
        setDetailError(err instanceof ApiError ? err.message : 'Could not load that run.');
      } finally {
        setDetailLoading(false);
      }
    },
    [openId]
  );

  if (!loading && runs.length === 0 && !error) return null;

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <History className="h-4 w-4 text-gray-400" />
          Past software installs
        </h2>
        <span className="text-xs text-gray-500">
          {runs.length} run{runs.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading && runs.length === 0 ? (
        <p className="mt-4 text-xs text-gray-500">Loading…</p>
      ) : null}

      <div className="mt-4 space-y-2">
        {runs.map((run) => {
          const state = runState(run);
          const expanded = openId === run.id;
          return (
            <div key={run.id} className="rounded-lg border border-gray-100">
              <button
                type="button"
                onClick={() => void toggle(run.id)}
                className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left transition hover:bg-gray-50"
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                )}
                <span className="text-xs font-medium text-gray-900">{timeLabel(run.createdAt)}</span>
                <span className="text-xs text-gray-500">
                  {run.vmCount} VM{run.vmCount === 1 ? '' : 's'}
                  {run.softwareNames.length > 0 ? ` · ${run.softwareNames.join(', ')}` : ''}
                </span>
                {run.projectName ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                    {run.projectName}
                  </span>
                ) : null}
                <span
                  className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${state.tone}`}
                >
                  {state.spinning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {!state.spinning && run.failed > 0 ? <XCircle className="h-3.5 w-3.5" /> : null}
                  {!state.spinning && run.failed === 0 && run.success > 0 ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : null}
                  {state.label}
                </span>
              </button>

              {expanded ? (
                <div className="border-t border-gray-100 px-3 py-3">
                  {detailLoading ? (
                    <p className="inline-flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading this run…
                    </p>
                  ) : detailError ? (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                      {detailError}
                    </p>
                  ) : detail ? (
                    <>
                      <dl className="mb-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                        {detail.targetLabel ? (
                          <div className="flex gap-2">
                            <dt className="text-gray-500">Assigned to</dt>
                            <dd className="text-gray-800">
                              {detail.targetLabel}
                              {detail.targetType ? ` (${detail.targetType})` : ''}
                            </dd>
                          </div>
                        ) : null}
                        {detail.projectName ? (
                          <div className="flex gap-2">
                            <dt className="text-gray-500">Project</dt>
                            <dd className="text-gray-800">
                              {detail.projectName}
                              {detail.clientName ? ` · ${detail.clientName}` : ''}
                            </dd>
                          </div>
                        ) : null}
                        {detail.assignedCount !== null ? (
                          <div className="flex gap-2">
                            <dt className="text-gray-500">Logins granted</dt>
                            <dd className="text-gray-800">{detail.assignedCount}</dd>
                          </div>
                        ) : null}
                        {detail.resetSummary ? (
                          <div className="flex gap-2">
                            <dt className="text-gray-500">Reset step</dt>
                            <dd className="text-gray-800">{detail.resetSummary}</dd>
                          </div>
                        ) : null}
                      </dl>

                      {detail.vms.some((v) => v.email) ? (
                        <div className="mb-3 overflow-hidden rounded-lg border border-gray-100">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                              <tr>
                                <th className="px-3 py-1.5">IP</th>
                                <th className="px-3 py-1.5">VM login</th>
                                <th className="px-3 py-1.5">Portal user</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {detail.vms.map((vm) => (
                                <tr key={vm.ipAddress}>
                                  <td className="px-3 py-1.5 font-mono text-gray-900">
                                    {vm.ipAddress}
                                  </td>
                                  <td className="px-3 py-1.5 font-mono text-gray-600">
                                    {vm.vmUsername ?? '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-gray-600">{vm.email ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}

                      {detail.jobs.length > 0 ? (
                        <InstallProgressPanel
                          result={detail}
                          catalog={catalog}
                          isAuthenticated={isAuthenticated}
                          frame="plain"
                        />
                      ) : (
                        <p className="text-xs text-gray-500">
                          These install jobs were cleared from the Machine Manager, so there is no
                          progress left to show.
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
