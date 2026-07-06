'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { OrgAdminBudgetTab } from './OrgAdminBudgetTab';
import { OrgAdminCleanupTab } from './OrgAdminCleanupTab';
import { OrgAdminUsersTable } from './OrgAdminUsersTable';
import { CustomRolesTab } from './CustomRolesTab';
import { CustomServicesTab } from './CustomServicesTab';
import type {
  OrgAdminAzureRoleOption,
  OrgAdminMonitoringResponse,
  OrgAdminRequestDetail,
  OrgAdminRequestSummary,
  OrgAdminUser,
  OrgAdminUserAzureCost,
} from '../../types/orgAdmin';

type DetailTab = 'users' | 'cleanup' | 'budget' | 'custom-roles' | 'custom-services';

interface OrgAdminRequestDetailPanelProps {
  request: OrgAdminRequestSummary;
  requestDetail: OrgAdminRequestDetail | null;
  users: OrgAdminUser[];
  availableRoles: OrgAdminAzureRoleOption[];
  loading: boolean;
  detailError: string | null;
  saving: boolean;
  onRetry: () => void;
  onForceLogout: (userId: number) => Promise<boolean>;
  onUpdateRoles: (userId: number, roles: string[]) => Promise<boolean>;
  fetchUserMonitoring: (userId: number) => Promise<OrgAdminMonitoringResponse | null>;
  onFetchAzureCost: (userId: number) => Promise<OrgAdminUserAzureCost | null>;
  onRenewBudget: (userId: number, topUpAmount: number) => Promise<boolean>;
  onToggleCleanup: (userId: number, disabled: boolean) => Promise<boolean>;
  onManualCleanup: (userId: number) => Promise<boolean>;
  onReprovisionRoles: () => Promise<boolean>;
}

export function OrgAdminRequestDetailPanel({
  request,
  requestDetail,
  users,
  availableRoles,
  loading,
  detailError,
  saving,
  onRetry,
  onForceLogout,
  onUpdateRoles,
  fetchUserMonitoring,
  onFetchAzureCost,
  onRenewBudget,
  onToggleCleanup,
  onManualCleanup,
  onReprovisionRoles,
}: OrgAdminRequestDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('users');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  useEffect(() => {
    if (activeTab !== 'users') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      onRetry();
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [activeTab, onRetry]);

  const handleReprovisionRoles = async () => {
    if (
      !window.confirm(
        `Re-provision all roles for request #${request.id}? This will assign all missing dependency roles.`
      )
    ) {
      return;
    }

    await onReprovisionRoles();
  };

  const infoItems = [
    { label: 'Request', value: `#${request.id}` },
    { label: 'Customer', value: request.customerEmail },
    { label: 'Region', value: request.region || '—' },
    {
      label: 'Expires',
      value: request.expiryDate ? new Date(request.expiryDate).toLocaleDateString() : '—',
    },
    { label: 'Users', value: String(request.userCount) },
    ...(requestDetail?.liveSummary?.activeSessions
      ? [{ label: 'Live sessions', value: String(requestDetail.liveSummary.activeSessions) }]
      : []),
    ...(requestDetail?.enableDailyUsage
      ? [
          {
            label: 'Daily usage',
            value: requestDetail.dailyLimitHours
              ? `${requestDetail.dailyLimitHours}h/day`
              : requestDetail.dailyLimitMinutes
                ? `${Math.round(requestDetail.dailyLimitMinutes / 60)}h/day`
                : 'Window only',
          },
        ]
      : []),
  ];

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
          <button
            type="button"
            onClick={() => void handleReprovisionRoles()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} />
            Fix Roles
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {(
            [
              { id: 'users' as const, label: 'Users' },
              { id: 'cleanup' as const, label: 'Cleanup' },
              { id: 'budget' as const, label: 'Budget' },
              { id: 'custom-roles' as const, label: 'Custom Roles' },
              { id: 'custom-services' as const, label: 'Custom Services' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
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
      ) : (
        <>
          {activeTab === 'users' && (
            <div className="p-4">
              <OrgAdminUsersTable
                users={users}
                request={requestDetail}
                requestId={request.id}
                availableRoles={availableRoles}
                loading={loading}
                selectedUserId={selectedUserId}
                saving={saving}
                onSelect={setSelectedUserId}
                onForceLogout={onForceLogout}
                onUpdateRoles={onUpdateRoles}
                fetchUserMonitoring={fetchUserMonitoring}
                onFetchAzureCost={onFetchAzureCost}
                embedded
              />
            </div>
          )}

          {activeTab === 'cleanup' && (
            <OrgAdminCleanupTab
              users={users}
              request={requestDetail}
              requestId={request.id}
              saving={saving}
              onToggleCleanup={onToggleCleanup}
              onManualCleanup={onManualCleanup}
            />
          )}

          {activeTab === 'budget' && (
            <OrgAdminBudgetTab
              users={users}
              requestId={request.id}
              saving={saving}
              onRenewBudget={onRenewBudget}
            />
          )}

          {activeTab === 'custom-roles' && (
            <CustomRolesTab requestId={request.id} users={users} />
          )}

          {activeTab === 'custom-services' && (
            <CustomServicesTab requestId={request.id} />
          )}
        </>
      )}
    </div>
  );
}

export function OrgAdminRequestCardChevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
    />
  );
}
