'use client';

import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { formatCurrency } from '../../api/orgAdminClient';
import type {
  AwsIamPolicyGroup,
  AwsOrgAdminRequestDetail,
  AwsOrgAdminRequestSummary,
  AwsOrgAdminUserCost,
} from '../../types/orgAdmin';
import { AwsOrgAdminBudgetTab } from './AwsOrgAdminBudgetTab';
import { AwsOrgAdminCleanupTab } from './AwsOrgAdminCleanupTab';
import { AwsOrgAdminUsersTable } from './AwsOrgAdminUsersTable';

type DetailTab = 'users' | 'cleanup' | 'budget';

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
  onSuspend: (userIndex: number) => Promise<boolean>;
  onReinstate: (userIndex: number) => Promise<boolean>;
  onDelete: (userIndex: number) => Promise<boolean>;
  onConsoleUrl: (userIndex: number) => Promise<boolean>;
  onUpdatePermissions: (userIndex: number, policies: string[]) => Promise<boolean>;
  onRenewBudget: (userIndex: number, topUpAmount: number) => Promise<boolean>;
  onCleanup: (userIndex: number) => Promise<boolean>;
  onToggleCleanup: (enabled: boolean) => Promise<boolean>;
  onFetchCost: (userIndex: number) => Promise<AwsOrgAdminUserCost | null>;
  onForceLogout: (userIndex: number) => Promise<boolean>;
  fetchUserMonitoring: (
    userIndex: number
  ) => Promise<import('../../types/orgAdmin').AwsOrgAdminMonitoringResponse | null>;
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
  onSuspend,
  onReinstate,
  onDelete,
  onConsoleUrl,
  onUpdatePermissions,
  onRenewBudget,
  onCleanup,
  onToggleCleanup,
  onFetchCost,
  onForceLogout,
  fetchUserMonitoring,
}: AwsOrgAdminRequestDetailPanelProps) {
  const [syncing, setSyncing] = useState(false);

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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {(
              [
                { id: 'users' as const, label: 'Users' },
                { id: 'cleanup' as const, label: 'Cleanup' },
                { id: 'budget' as const, label: 'Budget' },
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
                onDelete={onDelete}
                onConsoleUrl={onConsoleUrl}
                onUpdatePermissions={onUpdatePermissions}
                onFetchCost={onFetchCost}
                onForceLogout={onForceLogout}
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
            />
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
