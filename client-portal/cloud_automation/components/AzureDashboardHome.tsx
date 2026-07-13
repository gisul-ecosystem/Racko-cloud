'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
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
import { AZURE_SERVICE } from '../constants';
import { useAzureRoutes } from '../../lib/cloudPortalRoutes';
import { useIsTenantPortal } from '../../lib/portalMode';
import { useProvisioningRequests } from '../hooks/useProvisioningRequests';
import { RequestStatusBadge } from './RequestStatusBadge';
import {
  formatAzureRegion,
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  getAccountCount,
  getCreatedAt,
  getCustomerEmail,
  getEstimatedPrice,
  getRequestStatus,
  truncateEmail,
} from '../utils/formatters';

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'red' | 'blue' | 'green' | 'gray';
}) {
  const toneClass = {
    red: 'bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)]',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    gray: 'bg-gray-100 text-gray-500',
  }[tone];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

export function AzureDashboardHome() {
  const router = useRouter();
  const auth = useOptionalAuth();
  const isTenantPortal = useIsTenantPortal();
  const isAuthenticated = isTenantPortal || (auth?.isAuthenticated ?? false);
  const AZURE_ROUTES = useAzureRoutes();
  const { requests, stats, loading, error, refetch } = useProvisioningRequests(isAuthenticated);

  const recentRequests = requests.slice(0, 10);
  const completionRate =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      {/* Page header */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)]">
              <Cloud className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{AZURE_SERVICE.name}</h1>
              <p className="mt-1 max-w-xl text-sm text-gray-500">{AZURE_SERVICE.description}</p>
              {!loading && !error && stats.total > 0 ? (
                <p className="mt-2 text-xs text-gray-400">
                  {stats.total} total request{stats.total !== 1 ? 's' : ''}
                  {stats.completed > 0 ? ` · ${completionRate}% completed` : ''}
                  {stats.provisioning > 0 ? ` · ${stats.provisioning} provisioning` : ''}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refetch}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              href={AZURE_ROUTES.createRequest}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--cloud-accent,#B91C1C)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
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
          {/* Metrics */}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total Requests"
                value={stats.total}
                icon={<FileText className="h-6 w-6" />}
                tone="red"
              />
              <StatCard
                label="Completed"
                value={stats.completed}
                icon={<CheckCircle2 className="h-6 w-6" />}
                tone="green"
              />
              <StatCard
                label="Provisioning"
                value={stats.provisioning}
                icon={<Activity className="h-6 w-6" />}
                tone="blue"
              />
              <StatCard
                label="Expired"
                value={stats.expired}
                icon={<Timer className="h-6 w-6" />}
                tone="gray"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Recent requests */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Recent requests</h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {loading
                      ? 'Loading…'
                      : `${requests.length} total · click a row to view details`}
                  </p>
                </div>
                {!loading && requests.length > 0 ? (
                  <Link
                    href={AZURE_ROUTES.createRequest}
                    className="text-sm font-medium text-[var(--cloud-accent,#B91C1C)] transition hover:opacity-80"
                  >
                    New request
                  </Link>
                ) : null}
              </div>

              {loading ? (
                <TableSkeleton rows={5} cols={6} embedded />
              ) : recentRequests.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                    <Cloud className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">No provisioning requests yet</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Create a request to start Azure lab provisioning.
                  </p>
                  <Link
                    href={AZURE_ROUTES.createRequest}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--cloud-accent,#B91C1C)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-95"
                  >
                    <Plus className="h-4 w-4" />
                    Create Request
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          ID
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
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Est. Price
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRequests.map((request, index) => {
                        const createdAt = getCreatedAt(request);

                        return (
                          <tr
                            key={request.id}
                            onClick={() => router.push(AZURE_ROUTES.requestStatus(request.id))}
                            className={`group cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                              index % 2 !== 0 ? 'bg-gray-50/40' : ''
                            }`}
                          >
                            <td className="px-6 py-3.5 font-mono text-xs text-gray-600">
                              #{request.id}
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
                            <td className="px-4 py-3.5 text-gray-600">
                              {formatCurrency(getEstimatedPrice(request))}
                            </td>
                            <td className="px-6 py-3.5 text-gray-500">
                              <span
                                className="inline-flex items-center gap-1"
                                title={formatDateTime(createdAt)}
                              >
                                {formatRelativeTime(createdAt)}
                                <ChevronRight className="h-3.5 w-3.5 text-gray-300 opacity-0 transition group-hover:opacity-100" />
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

            {/* Sidebar */}
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">Quick actions</h2>
                <div className="mt-3 space-y-2">
                  <Link
                    href={AZURE_ROUTES.createRequest}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:border-[var(--cloud-accent,#B91C1C)] hover:bg-[var(--cloud-accent-soft,#fef2f2)] hover:text-[var(--cloud-accent,#B91C1C)]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      New provisioning request
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                  <button
                    type="button"
                    onClick={refetch}
                    disabled={loading}
                    className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
                  >
                    <RefreshCw className={`h-4 w-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                    Refresh dashboard
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--cloud-accent,#B91C1C)]" />
                  <h2 className="text-sm font-semibold text-gray-900">Operational notes</h2>
                </div>
                <ul className="space-y-3 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cloud-accent,#B91C1C)]" />
                    Requests are provisioned into Azure resource groups via the cloud automation API.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cloud-accent,#B91C1C)]" />
                    Pending requests are actively provisioning; completed requests have credentials ready.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cloud-accent,#B91C1C)]" />
                    Expired requests are cleaned up automatically by the expiry scheduler.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cloud-accent,#B91C1C)]" />
                    Use Org Admin for resource group management and elevated access workflows.
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
