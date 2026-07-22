'use client';

import { Activity, Clock, MapPin, Server, Users } from 'lucide-react';
import { RequestStatusBadge } from '../RequestStatusBadge';
import { formatCurrency, formatDateTime, formatMinutes } from '../../utils/formatters';
import type { OrgAdminRequestDetail, OrgAdminUser } from '../../types/orgAdmin';
import { CostingModeBadge } from './CostingModeBadge';

interface OrgAdminRequestSummaryProps {
  request: OrgAdminRequestDetail | null;
  users: OrgAdminUser[];
  loading: boolean;
}

export function OrgAdminRequestSummary({ request, users, loading }: OrgAdminRequestSummaryProps) {
  if (loading || !request) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  const isPerUser = request.costingMode === 'per_user';
  const liveSummary = request.liveSummary;
  const hasActiveSessions = users.some((user) => user.hasActiveSession);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {request.projectName?.trim() || `Project ${request.requestId}`}
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">{request.customerEmail}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {request.idMode === 'test_ids' ? (
              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                Test ID
              </span>
            ) : null}
            <CostingModeBadge mode={request.costingMode} size="md" />
            <RequestStatusBadge status={request.status} />
            {hasActiveSessions && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                Live tracking
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Resource group</p>
          <p className="mt-1 font-mono text-sm text-gray-900">
            {isPerUser
              ? request.perUserResourceGroupCount > 0
                ? `${request.perUserResourceGroupCount} dedicated RGs`
                : 'Per-user (provisioning)'
              : request.resourceGroup || '—'}
          </p>
          {isPerUser && request.resourceGroup && (
            <p className="mt-0.5 text-xs text-gray-500">Base: {request.resourceGroup}</p>
          )}
        </div>

        <div>
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            <MapPin className="h-3 w-3" />
            Location
          </p>
          <p className="mt-1 text-sm text-gray-900">{request.location || '—'}</p>
        </div>

        <div>
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            <Users className="h-3 w-3" />
            Users
          </p>
          <p className="mt-1 text-sm text-gray-900">{users.length}</p>
        </div>

        <div>
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            <Server className="h-3 w-3" />
            Resources / user
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {liveSummary?.resourceCount ?? 0}
          </p>
          {liveSummary && liveSummary.hourlyResourceRate > 0 && (
            <p className="text-xs text-gray-500">
              {formatCurrency(liveSummary.hourlyResourceRate)}/hr retail
            </p>
          )}
        </div>

        <div>
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            <Activity className="h-3 w-3" />
            Live usage cost
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {formatCurrency(liveSummary?.totalLiveCost ?? 0)}
          </p>
          <p className="text-xs text-gray-500">
            {formatMinutes(liveSummary?.totalMinutesSpent ?? 0)} total session time
          </p>
        </div>
      </div>

      {(request.enableDailyUsage || request.expiryDate) && (
        <div className="border-t border-gray-100 px-6 py-3">
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            {request.enableDailyUsage && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                Daily limit: {formatMinutes(request.dailyLimitMinutes)} per user
                {request.enforceInAzure ? ' (enforced)' : ''}
              </span>
            )}
            {request.expiryDate && (
              <span>Expires: {formatDateTime(request.expiryDate)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
