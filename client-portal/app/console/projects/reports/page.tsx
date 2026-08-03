'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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

export default function ProjectReportsPage() {
  const [tab, setTab] = useState<Tab>('project');
  const [byProject, setByProject] = useState<ProjectReportByProjectRow[]>([]);
  const [byService, setByService] = useState<ProjectReportByServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Cost reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Debits from your main organization wallet, grouped by project or service.
        </p>
      </div>

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

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byProject.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No project-tagged charges yet.
                  </td>
                </tr>
              ) : (
                byProject.map((row) => (
                  <tr key={row.projectId || 'unassigned'}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.projectName || 'Unassigned'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.clientName || '—'}</td>
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
                  <tr key={row.serviceKey}>
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
    </div>
  );
}
