'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { AZURE_SERVICE } from '../constants';
import { useAzureRoutes } from '../../lib/cloudPortalRoutes';
import { useIsTenantPortal } from '../../lib/portalMode';
import { useProvisioningRequests } from '../hooks/useProvisioningRequests';
import { RequestStatusBadge } from './RequestStatusBadge';
import { RACKO_BTN_PRIMARY, RACKO_BTN_SECONDARY, RACKO_LINK_ACCENT } from './cloudButtonStyles';
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
  hint,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'red' | 'blue' | 'green' | 'gray';
  hint?: string;
}) {
  const toneStyles = {
    red: {
      icon: 'bg-red-50 text-[#B91C1C]',
      ring: 'group-hover:border-[#B91C1C]/30',
    },
    blue: {
      icon: 'bg-blue-50 text-blue-600',
      ring: 'group-hover:border-blue-200',
    },
    green: {
      icon: 'bg-green-50 text-green-600',
      ring: 'group-hover:border-green-200',
    },
    gray: {
      icon: 'bg-gray-100 text-gray-500',
      ring: 'group-hover:border-gray-300',
    },
  }[tone];

  return (
    <div
      className={`group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md ${toneStyles.ring}`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${toneStyles.icon}`}
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

function CompletionBar({ rate }: { rate: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Completion rate</p>
          <p className="mt-0.5 text-xs text-gray-500">Share of requests fully provisioned</p>
        </div>
        <p className="text-2xl font-bold text-[#B91C1C]">{rate}%</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#B91C1C] to-[#DC2626] transition-all duration-500"
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
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
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-[#B91C1C] via-[#DC2626] to-[#B91C1C]" />
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C] ring-1 ring-[#B91C1C]/10">
              <Cloud className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
                Cloud automation
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                {AZURE_SERVICE.name}
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
                {AZURE_SERVICE.description}
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
            <Link href={AZURE_ROUTES.createRequest} className={RACKO_BTN_PRIMARY}>
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
            <>
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
                  hint={stats.total > 0 ? `${completionRate}% of total` : undefined}
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

              {stats.total > 0 ? (
                <CompletionBar rate={completionRate} />
              ) : null}
            </>
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
                  <Link href={AZURE_ROUTES.createRequest} className={RACKO_LINK_ACCENT}>
                    New request
                  </Link>
                ) : null}
              </div>

              {loading ? (
                <TableSkeleton rows={5} cols={6} embedded />
              ) : recentRequests.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-[#B91C1C]/10">
                    <Cloud className="h-8 w-8 text-[#B91C1C]" />
                  </div>
                  <p className="text-base font-semibold text-gray-900">No provisioning requests yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
                    Create your first Azure lab request to provision resource groups and access
                    credentials.
                  </p>
                  <Link href={AZURE_ROUTES.createRequest} className={`mt-6 ${RACKO_BTN_PRIMARY}`}>
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
                    <tbody className="divide-y divide-gray-50">
                      {recentRequests.map((request) => {
                        const createdAt = getCreatedAt(request);

                        return (
                          <tr
                            key={request.id}
                            onClick={() => router.push(AZURE_ROUTES.requestStatus(request.id))}
                            className="group cursor-pointer transition-colors hover:bg-red-50/40"
                          >
                            <td className="px-6 py-3.5 font-mono text-xs font-medium text-gray-600">
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
                            <td className="px-4 py-3.5 font-medium text-gray-700">
                              {formatCurrency(getEstimatedPrice(request))}
                            </td>
                            <td className="px-6 py-3.5 text-gray-500">
                              <span
                                className="inline-flex items-center gap-1"
                                title={formatDateTime(createdAt)}
                              >
                                {formatRelativeTime(createdAt)}
                                <ChevronRight className="h-3.5 w-3.5 text-[#B91C1C] opacity-0 transition group-hover:opacity-100" />
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
                <p className="mt-0.5 text-xs text-gray-400">Common tasks for Azure automation</p>
                <div className="mt-4 space-y-2">
                  <Link href={AZURE_ROUTES.createRequest} className={`w-full ${RACKO_BTN_PRIMARY}`}>
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                    <Clock className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-gray-900">Operational notes</h2>
                </div>
                <ul className="space-y-3 text-sm leading-relaxed text-gray-600">
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" />
                    Requests are provisioned into Azure resource groups via the cloud automation API.
                  </li>
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" />
                    Pending requests are actively provisioning; completed requests have credentials
                    ready.
                  </li>
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" />
                    Expired requests are cleaned up automatically by the expiry scheduler.
                  </li>
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" />
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
