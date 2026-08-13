'use client';

import { AlertTriangle, Shield } from 'lucide-react';
import type { OrgAdminSubscriptionRoleQuota } from '../../types/orgAdmin';

interface OrgAdminSubscriptionRoleQuotaProps {
  quota: OrgAdminSubscriptionRoleQuota | null;
  loading?: boolean;
  error?: string | null;
}

function formatCount(value: number, exhausted: boolean, limit: number): string {
  if (exhausted && value >= limit) {
    return `${limit.toLocaleString()}+`;
  }
  return value.toLocaleString();
}

export function OrgAdminSubscriptionRoleQuotaCard({
  quota,
  loading = false,
  error = null,
}: OrgAdminSubscriptionRoleQuotaProps) {
  if (loading && !quota) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
        <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        Could not load subscription role quota: {error}
      </div>
    );
  }

  if (!quota) {
    return null;
  }

  const barColor = quota.exhausted
    ? 'bg-red-500'
    : quota.warning
      ? 'bg-amber-500'
      : 'bg-blue-600';

  const borderTone = quota.exhausted
    ? 'border-red-200 bg-red-50'
    : quota.warning
      ? 'border-amber-200 bg-amber-50'
      : 'border-gray-200 bg-white';

  const textTone = quota.exhausted
    ? 'text-red-900'
    : quota.warning
      ? 'text-amber-900'
      : 'text-gray-900';

  const subTone = quota.exhausted
    ? 'text-red-700'
    : quota.warning
      ? 'text-amber-800'
      : 'text-gray-500';

  return (
    <div className={`rounded-xl border px-5 py-4 ${borderTone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              quota.exhausted ? 'bg-red-100 text-red-700' : quota.warning ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'
            }`}
          >
            {quota.exhausted || quota.warning ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Shield className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2 className={`text-sm font-semibold ${textTone}`}>Subscription role quota</h2>
            <p className={`mt-0.5 text-xs ${subTone}`}>
              Azure RBAC assignments across all resource groups in this subscription (limit {quota.limit.toLocaleString()})
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className={`text-lg font-bold tabular-nums ${textTone}`}>
            {formatCount(quota.usedAtLeast, quota.exhausted, quota.limit)} / {quota.limit.toLocaleString()}
          </div>
          <div className={`text-xs font-medium ${subTone}`}>
            {quota.exhausted
              ? '0 remaining — new labs cannot assign access'
              : `${quota.remaining.toLocaleString()} remaining`}
          </div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, quota.percentUsed)}%` }}
        />
      </div>

      {quota.exhausted ? (
        <p className="mt-3 text-xs leading-relaxed text-red-700">
          Quota is full. Delete failed or unused labs from this portal to release that lab&apos;s assignments.
          Do not bulk-delete roles subscription-wide in Azure Portal.
        </p>
      ) : quota.warning ? (
        <p className="mt-3 text-xs leading-relaxed text-amber-800">
          Headroom is low. Consider deleting unused labs before provisioning large requests.
        </p>
      ) : null}
    </div>
  );
}
