'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { HardDrive, Loader2, Monitor, Plus } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { useDedicatedServerPortal } from '@/context/DedicatedServerPortalContext';
import {
  formatDedicatedStatus,
  type IDedicatedServer,
} from '@/lib/dedicatedServerApi';
import { fetchProjects, type OrgProject } from '@/lib/projectsApi';
import { fetchTenantProjects } from '@/lib/tenantProjectsApi';
import { useIsTenantPortal } from '@/lib/portalMode';
import { ErrorState } from '@/components/dashboard/ErrorState';

function formatInr(n: number) {
  return `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function MyDedicatedServersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterProjectId = searchParams?.get('projectId')?.trim() || null;
  const isTenantPortal = useIsTenantPortal();
  const { api, routes, isReady } = useDedicatedServerPortal();
  const [servers, setServers] = useState<IDedicatedServer[]>([]);
  const [projectsById, setProjectsById] = useState<Map<string, OrgProject>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, projects] = await Promise.all([
        api.fetchServers(),
        isTenantPortal ? fetchTenantProjects() : fetchProjects(),
      ]);
      setServers(list);
      setProjectsById(new Map(projects.map((p) => [p.id, p])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load servers.');
    } finally {
      setLoading(false);
    }
  }, [api, isTenantPortal]);

  useEffect(() => {
    if (isReady) void load();
  }, [load, isReady]);

  const visible = useMemo(() => {
    if (!filterProjectId) return servers;
    return servers.filter((s) => s.projectId === filterProjectId);
  }, [servers, filterProjectId]);

  return (
    <div className="mx-auto w-full max-w-screen-xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Servers</h1>
          <p className="mt-0.5 text-sm text-gray-500">Dedicated server requests for your account</p>
          {filterProjectId ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                Filtered by project
              </span>
              <Link
                href={routes.myServers}
                className="text-xs font-semibold text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
              >
                Clear filter
              </Link>
            </div>
          ) : null}
        </div>
        <Link
          href={
            filterProjectId
              ? `${routes.request}?projectId=${encodeURIComponent(filterProjectId)}`
              : routes.request
          }
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#a01717]"
        >
          <Plus className="h-4 w-4" />
          Request Server
        </Link>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
            </div>
          ) : visible.length === 0 ? (
            <div className="p-12 text-center">
              <HardDrive className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-500">
                {filterProjectId ? 'No servers for this project' : 'No dedicated servers yet'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Specs</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const active = s.status === 'active';
                  const expanded = expandedId === s._id;
                  const project = s.projectId ? projectsById.get(s.projectId) : undefined;
                  return (
                    <Fragment key={s._id}>
                      <tr className="border-b border-gray-50">
                        <td className="px-5 py-3.5 font-medium text-gray-900">{s.planName}</td>
                        <td className="px-4 py-3.5">
                          {s.projectId && project ? (
                            <span
                              className="inline-flex max-w-[10rem] truncate rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100"
                              title={
                                project.clientName
                                  ? `${project.name} · ${project.clientName}`
                                  : project.name
                              }
                            >
                              {project.name}
                            </span>
                          ) : s.projectId ? (
                            <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                              Project
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">
                          {s.specs.cpu} · {s.specs.ram} · {s.specs.disk}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                            {formatDedicatedStatus(s.status)}
                          </span>
                          {s.rejectionReason ? (
                            <p className="mt-1 max-w-xs text-xs text-red-600">{s.rejectionReason}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs">
                          {formatInr(s.monthlyPrice)}/mo
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {active ? (
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(routes.console(s._id))
                                }
                                className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white"
                              >
                                <Monitor className="h-3.5 w-3.5" />
                                Console
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedId((p) => (p === s._id ? null : s._id))
                                }
                                className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                              >
                                {expanded ? 'Hide' : 'Details'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                      {active && expanded ? (
                        <tr className="border-b border-green-100 bg-green-50/40">
                          <td colSpan={6} className="px-5 py-3 font-mono text-xs text-gray-700">
                            {s.hostname ? `${s.hostname} · ` : ''}
                            {s.ipAddress || '—'} · {s.username || '—'} · {s.protocol || '—'}
                            {s.password ? ` · ${s.password}` : ''}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
