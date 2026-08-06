'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchProjectCostReport,
  fetchServiceCostReport,
  PROJECT_SERVICE_LABELS,
  type ProjectReportByProjectRow,
  type ProjectReportByServiceRow,
} from '@/lib/projectsApi';
import type { AdminServiceKey } from '@/lib/adminServicesApi';

type Tab = 'project' | 'service';

function formatInr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function serviceLabel(key: string): string {
  if (key in PROJECT_SERVICE_LABELS) {
    return PROJECT_SERVICE_LABELS[key as AdminServiceKey];
  }
  return key;
}

// ─── Per-project drill-down panel ────────────────────────────────────────────

function ProjectDrillDown({
  row,
  onBack,
}: {
  row: ProjectReportByProjectRow;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<ProjectReportByServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row.projectId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetchServiceCostReport(row.projectId)
      .then(setRows)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Failed to load breakdown.'),
      )
      .finally(() => setLoading(false));
  }, [row.projectId]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all projects
      </button>

      {/* Summary header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Project</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {row.projectName || 'Unassigned'}
          </p>
          {row.clientName && (
            <p className="text-sm text-gray-500">Client: {row.clientName}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Total spend</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatInr(row.totalDebit)}</p>
          <p className="text-xs text-gray-400">{row.transactionCount} transaction{row.transactionCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Breakdown by service */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <BarChart3 className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Cost breakdown by service</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" />
          </div>
        ) : error ? (
          <p className="px-5 py-8 text-center text-sm text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            No service charges recorded for this project yet.
          </p>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Transactions</th>
                  <th className="px-5 py-3 text-right">Total debit</th>
                  <th className="px-5 py-3 text-right">% of project</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const pct = row.totalDebit > 0
                    ? ((r.totalDebit / row.totalDebit) * 100).toFixed(1)
                    : '0.0';
                  return (
                    <tr key={r.serviceKey} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {serviceLabel(r.serviceKey)}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{r.transactionCount}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">
                        {formatInr(r.totalDebit)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-[#B91C1C]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs text-gray-500">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main reports page ───────────────────────────────────────────────────────

export default function ProjectReportsPage() {
  const [tab, setTab] = useState<Tab>('project');
  const [byProject, setByProject] = useState<ProjectReportByProjectRow[]>([]);
  const [byService, setByService] = useState<ProjectReportByServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drill-down state — null means show the main table
  const [drillRow, setDrillRow] = useState<ProjectReportByProjectRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projects, services] = await Promise.all([
        fetchProjectCostReport(),
        fetchServiceCostReport(),
      ]);
      setByProject(projects);
      setByService(services);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Cost reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Debits from your main organization wallet, grouped by project or service.
        </p>
      </div>

      {/* Tabs — hidden when drilling into a project */}
      {!drillRow && (
        <div className="flex gap-2 border-b border-gray-200">
          {(
            [
              ['project', 'By project'],
              ['service', 'By service'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${
                tab === id
                  ? 'border-[#B91C1C] text-[#B91C1C]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Drill-down view ── */}
      {drillRow && (
        <ProjectDrillDown row={drillRow} onBack={() => setDrillRow(null)} />
      )}

      {/* ── Main tables ── */}
      {!drillRow && (
        <>
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
            </div>
          ) : tab === 'project' ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Transactions</th>
                    <th className="px-4 py-3 text-right">Total debit</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byProject.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No project-tagged charges yet.
                      </td>
                    </tr>
                  ) : (
                    byProject.map((row) => (
                      <tr
                        key={row.projectId || 'unassigned'}
                        className="hover:bg-gray-50/60"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {row.projectName || 'Unassigned'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.clientName || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{row.transactionCount}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatInr(row.totalDebit)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.projectId && (
                            <button
                              type="button"
                              onClick={() => setDrillRow(row)}
                              className="text-xs font-medium text-[#B91C1C] hover:underline"
                            >
                              View breakdown →
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Transactions</th>
                    <th className="px-4 py-3 text-right">Total debit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byService.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        No service-tagged charges yet.
                      </td>
                    </tr>
                  ) : (
                    byService.map((row) => (
                      <tr key={row.serviceKey} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {serviceLabel(row.serviceKey)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.transactionCount}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatInr(row.totalDebit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
