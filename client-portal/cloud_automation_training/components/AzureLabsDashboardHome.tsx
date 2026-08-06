'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cloud,
  FileText,
  MapPin,
  Plus,
  RefreshCw,
  Timer,
} from 'lucide-react';
import { useOptionalAuth } from '../../context/AuthContext';
import { ErrorState } from '../../components/dashboard/ErrorState';
import { TableSkeleton } from '../../components/dashboard/LoadingSkeleton';
import { useAzureRoutes } from '../../lib/cloudPortalRoutes';
import { useCloudAccentColor } from '../../lib/cloudAccent';
import { useIsTenantPortal } from '../../lib/portalMode';
import { hexToRgba, tenantAccentButton } from '../../lib/tenantAccentStyles';
import { fetchProjects, type OrgProject } from '../../lib/projectsApi';
import { fetchTenantProjects } from '../../lib/tenantProjectsApi';
import { useProvisioningRequests } from '../../cloud_automation/hooks/useProvisioningRequests';
import type { ProvisioningRequest } from '../../cloud_automation/types';
import { RequestStatusBadge } from '../../cloud_automation/components/RequestStatusBadge';
import { RACKO_BTN_SECONDARY } from '../../cloud_automation/components/cloudButtonStyles';
import {
  formatAzureRegion,
  formatDateTime,
  formatRelativeTime,
  getAccountCount,
  getCreatedAt,
  getCustomerEmail,
  getRequestStatus,
  truncateEmail,
} from '../../cloud_automation/utils/formatters';
import { AZURE_LABS_SERVICE, CLOUD_LABS_SERVICE } from '../constants';

const primaryBtnClass =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

function StatCard({
  label,
  value,
  icon,
  tone,
  hint,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'accent' | 'blue' | 'green' | 'gray';
  hint?: string;
  accent: string;
}) {
  const semanticIcon =
    tone === 'blue'
      ? 'bg-blue-50 text-blue-600'
      : tone === 'green'
        ? 'bg-green-50 text-green-600'
        : tone === 'gray'
          ? 'bg-gray-100 text-gray-500'
          : '';

  return (
    <div
      className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
      onMouseEnter={(e) => {
        if (tone === 'accent') {
          e.currentTarget.style.borderColor = hexToRgba(accent, 0.35);
        } else if (tone === 'blue') {
          e.currentTarget.style.borderColor = '#bfdbfe';
        } else if (tone === 'green') {
          e.currentTarget.style.borderColor = '#bbf7d0';
        } else {
          e.currentTarget.style.borderColor = '#d1d5db';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '';
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${semanticIcon}`}
          style={
            tone === 'accent'
              ? { backgroundColor: hexToRgba(accent, 0.1), color: accent }
              : undefined
          }
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
          {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

function CompletionBar({ rate, accent }: { rate: number; accent: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Completion rate</p>
          <p className="mt-0.5 text-xs text-gray-500">Share of lab requests fully provisioned</p>
        </div>
        <p className="text-2xl font-bold" style={{ color: accent }}>
          {rate}%
        </p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(rate, 100)}%`,
            background: `linear-gradient(90deg, ${accent}, ${hexToRgba(accent, 0.75)})`,
          }}
        />
      </div>
    </div>
  );
}

export function AzureLabsDashboardHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterProjectId = searchParams?.get('projectId')?.trim() || null;
  const auth = useOptionalAuth();
  const isTenantPortal = useIsTenantPortal();
  const accent = useCloudAccentColor();
  const soft = hexToRgba(accent, 0.1);
  const isAuthenticated = isTenantPortal || (auth?.isAuthenticated ?? false);
  const routes = useAzureRoutes();
  const { requests, stats, loading, error, refetch } = useProvisioningRequests(isAuthenticated);
  const [projectsById, setProjectsById] = useState<Map<string, OrgProject>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) {
      setProjectsById(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = isTenantPortal ? await fetchTenantProjects() : await fetchProjects();
        if (cancelled) return;
        setProjectsById(new Map(list.map((p) => [p.id, p])));
      } catch {
        if (!cancelled) setProjectsById(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isTenantPortal]);

  const getRackoProjectId = (request: ProvisioningRequest): string | null => {
    const raw = request.projectId ?? request.project_id;
    if (!raw) return null;
    return String(raw).trim() || null;
  };

  const filteredRequests = useMemo(() => {
    if (!filterProjectId) return requests;
    return requests.filter((r) => getRackoProjectId(r) === filterProjectId);
  }, [requests, filterProjectId]);

  const recentRequests = filteredRequests.slice(0, 10);
  const filterProject = filterProjectId ? projectsById.get(filterProjectId) : null;
  const completionRate =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div
          className="h-1"
          style={{
            background: `linear-gradient(90deg, ${accent}, ${hexToRgba(accent, 0.65)}, ${accent})`,
          }}
        />
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="flex items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ring-1"
              style={{
                backgroundColor: soft,
                color: accent,
                ['--tw-ring-color' as string]: hexToRgba(accent, 0.15),
              }}
            >
              <Cloud className="h-7 w-7" />
            </div>
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: accent }}
              >
                {CLOUD_LABS_SERVICE.name}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                {AZURE_LABS_SERVICE.name}
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
                {AZURE_LABS_SERVICE.description}
              </p>
              {!loading && !error && stats.total > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {stats.total} total
                  </span>
                  {stats.completed > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      {stats.completed} completed
                    </span>
                  ) : null}
                  {stats.provisioning > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {stats.provisioning} provisioning
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refetch}
              disabled={loading}
              className={RACKO_BTN_SECONDARY}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              href={routes.createRequest}
              className={primaryBtnClass}
              style={tenantAccentButton(accent)}
            >
              <Plus className="h-4 w-4" />
              Create Request
            </Link>
          </div>
        </div>
      </div>

      {error && !loading ? <ErrorState message={error} onRetry={refetch} /> : null}

      {!error ? (
        <>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-gray-100" />
                    <div className="space-y-2">
                      <div className="h-7 w-10 rounded bg-gray-200" />
                      <div className="h-4 w-24 rounded bg-gray-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Total Requests"
                  value={stats.total}
                  icon={<FileText className="h-6 w-6" />}
                  tone="accent"
                  accent={accent}
                />
                <StatCard
                  label="Completed"
                  value={stats.completed}
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  tone="green"
                  accent={accent}
                  hint={stats.total > 0 ? `${completionRate}% of total` : undefined}
                />
                <StatCard
                  label="Provisioning"
                  value={stats.provisioning}
                  icon={<Activity className="h-6 w-6" />}
                  tone="blue"
                  accent={accent}
                />
                <StatCard
                  label="Expired"
                  value={stats.expired}
                  icon={<Timer className="h-6 w-6" />}
                  tone="gray"
                  accent={accent}
                />
              </div>

              {stats.total > 0 ? <CompletionBar rate={completionRate} accent={accent} /> : null}
            </>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Recent lab requests</h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {loading
                      ? 'Loading…'
                      : `${filteredRequests.length} total · click a row to view details`}
                  </p>
                  {filterProjectId ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                        Project · {filterProject?.name || filterProjectId}
                      </span>
                      <Link
                        href={routes.dashboard}
                        className="text-xs font-semibold text-gray-500 underline transition hover:text-gray-700"
                      >
                        Clear filter
                      </Link>
                    </div>
                  ) : null}
                </div>
                {!loading && filteredRequests.length > 0 ? (
                  <Link
                    href={routes.createRequest}
                    className="inline-flex items-center gap-1 text-sm font-semibold transition hover:opacity-80"
                    style={{ color: accent }}
                  >
                    New request
                  </Link>
                ) : null}
              </div>

              {loading ? (
                <TableSkeleton rows={5} cols={6} embedded />
              ) : recentRequests.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <div
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ring-1"
                    style={{
                      backgroundColor: soft,
                      color: accent,
                      ['--tw-ring-color' as string]: hexToRgba(accent, 0.15),
                    }}
                  >
                    <Cloud className="h-8 w-8" />
                  </div>
                  <p className="text-base font-semibold text-gray-900">No Azure Labs requests yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
                    Create your first Azure Labs request to provision a training lab environment.
                  </p>
                  <Link
                    href={routes.createRequest}
                    className={`mt-6 ${primaryBtnClass}`}
                    style={tenantAccentButton(accent)}
                  >
                    <Plus className="h-4 w-4" />
                    Create Request
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/80">
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Project
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Region
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Accounts
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recentRequests.map((request) => {
                        const createdAt = getCreatedAt(request);
                        const rackoProjectId = getRackoProjectId(request);
                        const project = rackoProjectId
                          ? projectsById.get(rackoProjectId)
                          : undefined;

                        return (
                          <tr
                            key={request.id}
                            onClick={() => router.push(routes.requestStatus(request.id))}
                            className="group cursor-pointer transition-colors"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = soft;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '';
                            }}
                          >
                            <td className="px-6 py-3.5 font-mono text-xs font-medium text-gray-600">
                              #{request.id}
                            </td>
                            <td className="px-4 py-3.5">
                              {rackoProjectId && project ? (
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
                              ) : rackoProjectId ? (
                                <span className="inline-flex max-w-[10rem] truncate rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                                  Project
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                                  Unassigned
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-gray-900">
                              <span title={getCustomerEmail(request)}>
                                {truncateEmail(getCustomerEmail(request))}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-gray-600">
                              <span
                                className="inline-flex items-center gap-1.5"
                                title={request.location ?? undefined}
                              >
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                {formatAzureRegion(request.location)}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-gray-600">{getAccountCount(request)}</td>
                            <td className="px-4 py-3.5">
                              <RequestStatusBadge status={getRequestStatus(request)} />
                            </td>
                            <td className="px-6 py-3.5 text-gray-500">
                              <span
                                className="inline-flex items-center gap-1"
                                title={formatDateTime(createdAt)}
                              >
                                {formatRelativeTime(createdAt)}
                                <ChevronRight
                                  className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100"
                                  style={{ color: accent }}
                                />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">Quick actions</h2>
                <p className="mt-0.5 text-xs text-gray-400">Common tasks for Azure Labs</p>
                <div className="mt-4 space-y-2">
                  <Link
                    href={routes.createRequest}
                    className={`w-full ${primaryBtnClass}`}
                    style={tenantAccentButton(accent)}
                  >
                    <Plus className="h-4 w-4" />
                    Create Request
                  </Link>
                  <button
                    type="button"
                    onClick={refetch}
                    disabled={loading}
                    className={`w-full ${RACKO_BTN_SECONDARY}`}
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh dashboard
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: soft, color: accent }}
                  >
                    <Clock className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-gray-900">Lab notes</h2>
                </div>
                <ul className="space-y-3 text-sm leading-relaxed text-gray-600">
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                    Azure Labs focuses on training enrollments — no costing steps on this flow.
                    Select labs, instance sizes, and permissions the same way as Azure Services.
                  </li>
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                    Pending requests are actively provisioning; completed labs have credentials
                    ready.
                  </li>
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                    Expired labs are cleaned up automatically by the expiry scheduler.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
