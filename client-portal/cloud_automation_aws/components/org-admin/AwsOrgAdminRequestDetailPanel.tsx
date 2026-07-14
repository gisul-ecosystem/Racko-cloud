'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { formatCurrency } from '../../api/orgAdminClient';
import type {
  AwsIamPolicyGroup,
  AwsOrgAdminRequestDetail,
  AwsOrgAdminRequestSummary,
  AwsOrgAdminUserCost,
  AwsOrgAdminSharedCost,
} from '../../types/orgAdmin';
import { AwsOrgAdminBudgetTab } from './AwsOrgAdminBudgetTab';
import { AwsOrgAdminCleanupTab } from './AwsOrgAdminCleanupTab';
import { AwsOrgAdminUsersTable } from './AwsOrgAdminUsersTable';
import { AwsOrgAdminHistoryTab } from './AwsOrgAdminHistoryTab';
import { AwsCustomConfigTab } from './AwsCustomConfigTab';

type DetailTab = 'users' | 'history' | 'cleanup' | 'budget' | 'custom-config';

interface AwsOrgAdminRequestDetailPanelProps {
  request: AwsOrgAdminRequestSummary;
  requestDetail: AwsOrgAdminRequestDetail | null;
  iamPolicies: AwsIamPolicyGroup[];
  loading: boolean;
  detailError: string | null;
  saving: boolean;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onRetry: () => void;
  onSyncSpend: () => Promise<boolean>;
  onFixPermissions: () => Promise<boolean>;
  onDeleteRequest: () => Promise<boolean>;
  onRequestCleanup: () => Promise<boolean>;
  onFetchSharedCost: (options?: { refresh?: boolean }) => Promise<AwsOrgAdminSharedCost | null>;
  onSuspend: (userIndex: number) => Promise<boolean>;
  onReinstate: (userIndex: number) => Promise<boolean>;
  onUnblock: (userIndex: number) => Promise<boolean>;
  onDelete: (userIndex: number) => Promise<boolean>;
  onConsoleUrl: (userIndex: number) => Promise<boolean>;
  onUpdatePermissions: (userIndex: number, policies: string[]) => Promise<boolean>;
  onRenewBudget: (userIndex: number, topUpAmount: number) => Promise<boolean>;
  onCleanup: (userIndex: number) => Promise<boolean>;
  onToggleCleanup: (userIndex: number, enabled: boolean) => Promise<boolean>;
  onRequestCleanupSettings: (
    settings: {
      cleanupEnabled?: boolean;
      cleanupIntervalHours?: number;
      action?: 'delete' | 'pause';
    }
  ) => Promise<boolean>;
  onFetchCost: (userIndex: number) => Promise<AwsOrgAdminUserCost | null>;
  onForceLogout: (userIndex: number) => Promise<boolean>;
  fetchUserMonitoring: (
    userIndex: number
  ) => Promise<import('../../types/orgAdmin').AwsOrgAdminMonitoringResponse | null>;
  lastUpdatedAt: Date | null;
  isRefreshing: boolean;
  hasActiveUsers: boolean;
}

export function AwsOrgAdminRequestDetailPanel({
  request,
  requestDetail,
  iamPolicies,
  loading,
  detailError,
  saving,
  activeTab,
  onTabChange,
  onRetry,
  onSyncSpend,
  onFixPermissions,
  onDeleteRequest,
  onRequestCleanup,
  onFetchSharedCost,
  onSuspend,
  onReinstate,
  onUnblock,
  onDelete,
  onConsoleUrl,
  onUpdatePermissions,
  onRenewBudget,
  onCleanup,
  onToggleCleanup,
  onRequestCleanupSettings,
  onFetchCost,
  onForceLogout,
  fetchUserMonitoring,
  lastUpdatedAt,
  isRefreshing,
  hasActiveUsers,
}: AwsOrgAdminRequestDetailPanelProps) {
  const [syncing, setSyncing] = useState(false);
  const [sharedCost, setSharedCost] = useState<AwsOrgAdminSharedCost | null>(null);

  useEffect(() => {
    if (request.costingMode === 'shared') {
      void onFetchSharedCost().then(setSharedCost);
    }
  }, [onFetchSharedCost, request.costingMode, request.requestId]);

  const infoItems = [
    { label: 'Request', value: `#${String(request.requestId).slice(-6)}` },
    { label: 'Customer', value: request.customerEmail },
    { label: 'Region', value: request.region || '—' },
    {
      label: 'Expires',
      value: request.endDate ? new Date(request.endDate).toLocaleDateString() : '—',
    },
    { label: 'Users', value: String(request.userCount) },
    {
      label: 'Budget/user',
      value:
        requestDetail?.perUserBudgetUsd != null
          ? formatCurrency(requestDetail.perUserBudgetUsd)
          : 'None',
    },
    ...(requestDetail?.enableDailyUsage
      ? [
          {
            label: 'Daily usage',
            value: requestDetail.dailyLimitHours
              ? `${requestDetail.dailyLimitHours}h/day`
              : 'Window only',
          },
        ]
      : []),
  ];

  async function handleSyncSpend() {
    setSyncing(true);
    try {
      await onSyncSpend();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-b-xl border border-t-0 border-[#B91C1C]/30 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
        <div className="mb-3.5 flex flex-wrap gap-6">
          {infoItems.map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {item.label}
              </span>
              <span className="text-sm font-semibold text-gray-900">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void onFixPermissions()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} /> Fix Permissions
          </button>
          {hasActiveUsers && <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">● Live</span>}
          {isRefreshing && <span className="text-xs text-amber-700">Refreshing…</span>}
          {lastUpdatedAt && !isRefreshing && <span className="text-xs text-gray-400">Updated {Math.max(0, Math.round((Date.now() - lastUpdatedAt.getTime()) / 1000))}s ago</span>}
          <button type="button" disabled={saving} onClick={() => window.confirm(`Delete AWS request #${request.requestId}? This cannot be undone.`) && void onDeleteRequest()} className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete Request</button>
        </div>

        {request.costingMode === 'shared' && (
          <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm">
            <div><p className="text-xs text-violet-700">Shared AWS cost MTD</p><p className="font-semibold text-violet-950">{formatCurrency(sharedCost?.monthToDateCost ?? 0)}</p></div>
            <div className="text-xs text-gray-500">{sharedCost?.users?.length ?? 0} user attribution(s)</div>
            <button type="button" onClick={() => void onFetchSharedCost({ refresh: true }).then(setSharedCost)} className="ml-auto rounded-lg border bg-white px-3 py-1.5 text-xs">Refresh cost</button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {(
              [
                { id: 'users' as const, label: 'Users' },
                { id: 'history' as const, label: 'History' },
                { id: 'cleanup' as const, label: 'Cleanup' },
                { id: 'budget' as const, label: 'Budget' },
                { id: 'custom-config' as const, label: 'Custom IAM Policies & Services' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? 'border border-gray-200 bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSyncSpend()}
              disabled={syncing || saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Sync Spend
            </button>
          </div>
        </div>
      </div>

      {loading && !requestDetail ? (
        <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#B91C1C]" />
          Loading request details...
        </div>
      ) : detailError && !requestDetail ? (
        <div className="p-6">
          <ErrorState title="Failed to load request detail" message={detailError} onRetry={onRetry} />
        </div>
      ) : requestDetail ? (
        <>
          {activeTab === 'users' && (
            <div className="p-4">
              <AwsOrgAdminUsersTable
                detail={requestDetail}
                iamPolicies={iamPolicies}
                saving={saving}
                onSuspend={onSuspend}
                onReinstate={onReinstate}
                onUnblock={onUnblock}
                onDelete={onDelete}
                onConsoleUrl={onConsoleUrl}
                onUpdatePermissions={onUpdatePermissions}
                onFetchCost={onFetchCost}
                onForceLogout={onForceLogout}
                onCleanup={onCleanup}
                fetchUserMonitoring={fetchUserMonitoring}
              />
            </div>
          )}

          {activeTab === 'cleanup' && (
            <AwsOrgAdminCleanupTab
              detail={requestDetail}
              saving={saving}
              onCleanup={onCleanup}
              onToggleCleanup={onToggleCleanup}
              onRequestCleanup={onRequestCleanup}
              onRequestCleanupSettings={onRequestCleanupSettings}
            />
          )}

          {activeTab === 'history' && (
            <AwsOrgAdminHistoryTab requestId={request.requestId} users={requestDetail.users} />
          )}

          {activeTab === 'custom-config' && (
            <AwsCustomConfigTab requestId={request.requestId} users={requestDetail.users} />
          )}

          {activeTab === 'budget' && (
            <AwsOrgAdminBudgetTab
              detail={requestDetail}
              saving={saving}
              onRenewBudget={onRenewBudget}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

export function AwsRequestCardChevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
    />
  );
}
