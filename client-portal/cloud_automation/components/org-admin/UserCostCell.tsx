'use client';

import { useEffect, useState } from 'react';

import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

import {
  computeClientLiveCost,
  formatSyncedAgo,
  getHourlyRateForUser,
  getMinutesTodayForDisplay,
  LIVE_COST_TICK_MS,
} from '../../utils/costDisplayUtils';
import { formatMinutes } from '../../utils/formatters';

import type { OrgAdminUser, OrgAdminUserAzureCost } from '../../types/orgAdmin';

interface UserCostCellProps {
  user: OrgAdminUser;
  costingMode: 'per_user' | 'shared';
  azureCost?: OrgAdminUserAzureCost;
  loadingAzureCost?: boolean;
  expanded: boolean;
  onToggleExpand: (event: React.MouseEvent) => void;
  onRefreshAzure?: (event: React.MouseEvent) => void;
}

export function UserCostCell({
  user,
  costingMode,
  azureCost,
  loadingAzureCost = false,
  expanded,
  onToggleExpand,
  onRefreshAzure,
}: UserCostCellProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isShared = costingMode === 'shared';

  useEffect(() => {
    if (isShared) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, LIVE_COST_TICK_MS);

    return () => window.clearInterval(timer);
  }, [isShared]);

  const hourlyRate = getHourlyRateForUser(user);
  const liveCost = computeClientLiveCost(user, nowMs);
  const minutesToday = getMinutesTodayForDisplay(user, nowMs);
  const azureMtd = azureCost?.monthToDateCost ?? user.azureCostMtd ?? 0;
  const sharePercent = azureCost?.sharePercent ?? null;
  const syncedAt = azureCost?.queriedAt || user.lastCostSyncedAt;
  const freshnessNote =
    azureCost?.dataFreshnessNote ||
    'Azure billing data is typically delayed by several hours and may not include the current session.';
  const syncError = user.syncError;
  const budget = user.totalBudget ?? user.perUserBudgetUsd ?? null;
  const budgetPct =
    budget != null && budget > 0 ? Math.min(100, Math.round((azureMtd / budget) * 100)) : null;

  if (isShared) {
    return (
      <div>
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-start gap-1 text-left hover:text-violet-800"
        >
          {expanded ? (
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span className="text-[13px] font-semibold text-violet-900">
            {sharePercent != null ? `${sharePercent.toFixed(1)}%` : '—'} · ${azureMtd.toFixed(2)}
          </span>
        </button>
        <p className="mt-0.5 text-[10px] text-gray-400">attributed MTD share</p>
        {expanded && (
          <div className="mt-2 rounded border border-gray-100 bg-gray-50 px-2 py-2 text-[11px] text-gray-600">
            <p>
              <span className="font-medium text-gray-700">Your share:</span>{' '}
              {sharePercent != null ? `${sharePercent.toFixed(2)}%` : '—'} of shared RG MTD
            </p>
            <p className="mt-1">
              <span className="font-medium text-gray-700">Attributed MTD:</span> ${azureMtd.toFixed(4)}
            </p>
            <p className="mt-1 text-gray-500">{freshnessNote}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full text-left hover:text-violet-900"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-snug">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )}
          <span>
            <span className="font-medium text-orange-700">Live:</span>{' '}
            <span className="font-semibold text-gray-900">${liveCost.toFixed(2)}</span>
            <span className="text-gray-500"> ({formatMinutes(minutesToday)} today)</span>
          </span>
          <span className="text-gray-300">|</span>
          <span>
            <span className="font-medium text-violet-800">Azure MTD:</span>{' '}
            <span className={`font-semibold ${user.budgetExceeded ? 'text-red-600' : 'text-violet-900'}`}>
              ${azureMtd.toFixed(2)}
            </span>
            <span className="text-gray-500"> (synced {formatSyncedAgo(syncedAt, nowMs)})</span>
          </span>
          {onRefreshAzure && (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onRefreshAzure(event);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onRefreshAzure(event as unknown as React.MouseEvent);
                }
              }}
              className="inline-flex items-center text-violet-700 hover:text-violet-900"
              title="Refresh Azure MTD"
            >
              {loadingAzureCost ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </span>
          )}
        </div>
      </button>

      {budgetPct != null && (
        <div className="mt-1 ml-5 h-1 w-[100px] overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full ${budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-violet-500'}`}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
      )}

      {syncError && (
        <p
          className="mt-1 ml-5 inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700"
          title={syncError}
        >
          <AlertTriangle className="h-3 w-3" />
          Sync failed
        </p>
      )}

      {user.budgetExceeded && (
        <span className="mt-1 ml-5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
          Exceeded
        </span>
      )}

      {expanded && (
        <div className="mt-2 ml-5 rounded border border-gray-100 bg-gray-50 px-2 py-2 text-[11px] text-gray-600">
          <p>
            <span className="font-medium text-gray-700">Hourly rate:</span> ${hourlyRate.toFixed(4)}/hr
          </p>
          <p className="mt-1">
            <span className="font-medium text-gray-700">Merged minutes today:</span>{' '}
            {formatMinutes(minutesToday)}
          </p>
          <p className="mt-1 text-gray-500">{freshnessNote}</p>
        </div>
      )}
    </div>
  );
}
