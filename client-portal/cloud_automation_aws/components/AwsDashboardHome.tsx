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
  Server,
  Timer,
} from 'lucide-react';
import { useOptionalAuth } from '../../context/AuthContext';
import { ErrorState } from '../../components/dashboard/ErrorState';
import { TableSkeleton } from '../../components/dashboard/LoadingSkeleton';
import { RACKO_BTN_SECONDARY } from '../../components/console/cloudButtonStyles';
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
} from '../../cloud_automation/utils/formatters';
import { AWS_REGIONS, AWS_SERVICE } from '../constants';
import { useAwsRoutes } from '../../lib/cloudPortalRoutes';
import { useCloudAccentColor } from '../../lib/cloudAccent';
import { useIsTenantPortal } from '../../lib/portalMode';
import { hexToRgba, tenantAccentButton } from '../../lib/tenantAccentStyles';
import { useAwsRequests } from '../hooks/useAwsRequests';
import { AwsRequestStatusBadge } from './AwsRequestStatusBadge';
import type { AwsRequest } from '../api/client';

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
          <p className="mt-0.5 text-xs text-gray-500">Share of requests fully provisioned</p>
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

function formatAwsRegion(code: string | null | undefined): string {
  const normalized = String(code || '').trim();
  if (!normalized) return '—';
  const match = AWS_REGIONS.find((entry) => entry.code === normalized);
  return match?.name ?? normalized;
}

function truncateEmail(email: string): string {
  if (email.length <= 28) return email;
  return `${email.slice(0, 28)}…`;
}

function getCustomerEmail(request: AwsRequest): string {
  return request.customer_email ?? request.customerEmail ?? '—';
}

function getAccountCount(request: AwsRequest): number {
  return request.account_count ?? request.accountCount ?? 0;
}

function getEstimatedPrice(request: AwsRequest): number | null {
  const raw = request.estimated_price ?? request.estimatedPrice;
  if (raw == null) return null;
  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

function getCreatedAt(request: AwsRequest): string | null {
  return request.created_at ?? request.createdAt ?? null;
}

function formatRequestId(id: string): string {
  const str = String(id);
  return str.length > 10 ? `${str.slice(0, 8)}…` : str;
}

export function AwsDashboardHome() {
  const router = useRouter();
  const auth = useOptionalAuth();
  const isTenantPortal = useIsTenantPortal();
  const accent = useCloudAccentColor();
  const soft = hexToRgba(accent, 0.1);
  const isAuthenticated = isTenantPortal || (auth?.isAuthenticated ?? false);
  const AWS_ROUTES = useAwsRoutes();
  const { requests, stats, loading, error, refetch } = useAwsRequests(isAuthenticated);

  const recentRequests = requests.slice(0, 10);
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
              <Server className="h-7 w-7" />
            </div>
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: accent }}
              >
                Cloud automation
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                {AWS_SERVICE.name}
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
                {AWS_SERVICE.description}
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
              href={AWS_ROUTES.createRequest}
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
                  <h2 className="text-base font-semibold text-gray-900">Recent requests</h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {loading
                      ? 'Loading…'
                      : `${requests.length} total · click a row to view details`}
                  </p>
                </div>
                {!loading && requests.length > 0 ? (
                  <Link
                    href={AWS_ROUTES.createRequest}
                    className="inline-flex items-center gap-1 text-sm font-semibold transition hover:opacity-80"
                    style={{ color: accent }}
                  >
                    New request
                  </Link>
                ) : null}
              </div>

              {loading ? (
                <TableSkeleton rows={5} cols={7} embedded />
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
                  <p className="text-base font-semibold text-gray-900">No provisioning requests yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
                    Create your first AWS lab request to provision accounts and deliver access
                    credentials.
                  </p>
                  <Link
                    href={AWS_ROUTES.createRequest}
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
                          Request ID
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
                        const requestId = String(request._id);

                        return (
                          <tr
                            key={requestId}
                            onClick={() => router.push(AWS_ROUTES.requestStatus(requestId))}
                            className="group cursor-pointer transition-colors"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = soft;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '';
                            }}
                          >
                            <td
                              className="px-6 py-3.5 font-mono text-xs font-medium text-gray-600"
                              title={requestId}
                            >
                              {formatRequestId(requestId)}
                            </td>
                            <td className="px-4 py-3.5 text-gray-900">
                              <span title={getCustomerEmail(request)}>
                                {truncateEmail(getCustomerEmail(request))}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-gray-600">
                              <span
                                className="inline-flex items-center gap-1.5"
                                title={request.region ?? undefined}
                              >
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                {formatAwsRegion(request.region)}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-gray-600">{getAccountCount(request)}</td>
                            <td className="px-4 py-3.5">
                              <AwsRequestStatusBadge status={request.status ?? 'Unknown'} />
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
                <p className="mt-0.5 text-xs text-gray-400">Common tasks for AWS automation</p>
                <div className="mt-4 space-y-2">
                  <Link
                    href={AWS_ROUTES.createRequest}
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
                  <h2 className="text-sm font-semibold text-gray-900">Operational notes</h2>
                </div>
                <ul className="space-y-3 text-sm leading-relaxed text-gray-600">
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                    Requests are provisioned into AWS accounts via the cloud automation API.
                  </li>
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                    Pending requests are actively provisioning; completed requests have credentials
                    ready for delivery.
                  </li>
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                    Expired requests are cleaned up automatically by the expiry scheduler.
                  </li>
                  <li className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                    Use Org Admin for account management and elevated access workflows.
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
