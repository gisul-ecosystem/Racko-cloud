'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  Clock,
  Cloud,
  FileText,
  Plus,
  RefreshCw,
  Server,
  Timer,
} from 'lucide-react';
import { useOptionalAuth } from '../../context/AuthContext';
import { ErrorState } from '../../components/dashboard/ErrorState';
import { TableSkeleton } from '../../components/dashboard/LoadingSkeleton';
import { AWS_SERVICE } from '../constants';
import { useAwsRoutes } from '../../lib/cloudPortalRoutes';
import { useIsTenantPortal } from '../../lib/portalMode';
import { useAwsRequests } from '../hooks/useAwsRequests';
import { AwsRequestStatusBadge } from './AwsRequestStatusBadge';
import type { AwsRequest } from '../api/client';

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
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function formatRequestId(id: string): string {
  const str = String(id);
  return str.length > 8 ? `${str.slice(0, 8)}...` : str;
}

function getCustomerEmail(request: AwsRequest): string {
  const email = request.customer_email ?? request.customerEmail ?? '—';
  if (email.length <= 28) return email;
  return `${email.slice(0, 28)}…`;
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

function formatCurrency(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatCreatedAt(request: AwsRequest): string {
  const raw = request.created_at ?? request.createdAt;
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function AwsDashboardHome() {
  const router = useRouter();
  const auth = useOptionalAuth();
  const isTenantPortal = useIsTenantPortal();
  const isAuthenticated = isTenantPortal || (auth?.isAuthenticated ?? false);
  const AWS_ROUTES = useAwsRoutes();
  const { requests, stats, loading, error, refetch } = useAwsRequests(isAuthenticated);

  const recentRequests = requests.slice(0, 10);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)]">
              <Server className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{AWS_SERVICE.name}</h1>
              <p className="mt-1 max-w-xl text-sm text-gray-500">{AWS_SERVICE.description}</p>
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
              href={AWS_ROUTES.createRequest}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--cloud-accent,#B91C1C)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
            >
              <Plus className="h-4 w-4" />
              Create Request
            </Link>
          </div>
        </div>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {!error && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
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
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Recent requests</h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {loading
                      ? 'Loading…'
                      : `${requests.length} total provisioning request${requests.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>

              {loading ? (
                <TableSkeleton rows={5} cols={7} embedded />
              ) : recentRequests.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                    <Cloud className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">No requests yet</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Create a request to start AWS lab provisioning.
                  </p>
                  <Link
                    href={AWS_ROUTES.createRequest}
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
                    <tbody>
                      {recentRequests.map((request, index) => (
                        <tr
                          key={request._id}
                          onClick={() => router.push(AWS_ROUTES.requestStatus(String(request._id)))}
                          className={`cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                            index % 2 !== 0 ? 'bg-gray-50/40' : ''
                          }`}
                        >
                          <td className="px-6 py-3.5 font-mono text-xs text-gray-600">
                            {formatRequestId(String(request._id))}
                          </td>
                          <td className="px-4 py-3.5 text-gray-900">{getCustomerEmail(request)}</td>
                          <td className="px-4 py-3.5 text-gray-600">{request.region ?? '—'}</td>
                          <td className="px-4 py-3.5 text-gray-600">{getAccountCount(request)}</td>
                          <td className="px-4 py-3.5">
                            <AwsRequestStatusBadge status={request.status ?? 'Unknown'} />
                          </td>
                          <td className="px-4 py-3.5 text-gray-600">
                            {formatCurrency(getEstimatedPrice(request))}
                          </td>
                          <td className="px-6 py-3.5 text-gray-500">
                            {formatCreatedAt(request)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--cloud-accent,#B91C1C)]" />
                <h2 className="text-sm font-semibold text-gray-900">Operational notes</h2>
              </div>
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cloud-accent,#B91C1C)]" />
                  Requests flow through the AWS automation API and are provisioned into AWS accounts.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cloud-accent,#B91C1C)]" />
                  Pending requests are actively provisioning; completed requests have credentials
                  ready for delivery.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cloud-accent,#B91C1C)]" />
                  Expired requests are cleaned up automatically by the expiry scheduler.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cloud-accent,#B91C1C)]" />
                  Use Org Admin for account management and elevated access workflows.
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
