'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronRight, Loader2, Mail, RefreshCw, Trash2 } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { OrgAdminBudgetTab } from './OrgAdminBudgetTab';
import { OrgAdminCleanupTab } from './OrgAdminCleanupTab';
import { OrgAdminUsersTable } from './OrgAdminUsersTable';
import { OrgAdminHistoryTab } from './OrgAdminHistoryTab';
import { RequestCustomConfigTab } from './RequestCustomConfigTab';
import { OrgAdminPrivilegedRolesTab } from './OrgAdminPrivilegedRolesTab';
import type {
  OrgAdminAzureRoleOption,
  OrgAdminMonitoringResponse,
  OrgAdminRequestDetail,
  OrgAdminRequestSummary,
  OrgAdminUser,
  OrgAdminUserAzureCost,
  OrgAdminSharedAzureCostSummary,
} from '../../types/orgAdmin';

type DetailTab = 'users' | 'cleanup' | 'budget' | 'history' | 'custom-config' | 'privileged-roles';

const EXTEND_PRESETS = [
  { label: '+24 hours', hours: 24 },
  { label: '+3 days', hours: 72 },
  { label: '+7 days', hours: 168 },
] as const;

function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resolveCurrentStart(
  request: OrgAdminRequestSummary,
  detail: OrgAdminRequestDetail | null
): Date | null {
  const raw = detail?.startsAt || request.startsAt || request.startDate;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveCurrentExpiry(
  request: OrgAdminRequestSummary,
  detail: OrgAdminRequestDetail | null
): Date | null {
  const raw = detail?.expiresAt || request.expiresAt || detail?.expiryDate || request.expiryDate;
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  if (
    !detail?.expiresAt &&
    !request.expiresAt &&
    parsed.getHours() === 0 &&
    parsed.getMinutes() === 0 &&
    parsed.getSeconds() === 0 &&
    String(raw).length <= 10
  ) {
    parsed.setHours(18, 0, 0, 0);
  }
  return parsed;
}

interface OrgAdminRequestDetailPanelProps {
  request: OrgAdminRequestSummary;
  requestDetail: OrgAdminRequestDetail | null;
  users: OrgAdminUser[];
  availableRoles: OrgAdminAzureRoleOption[];
  loading: boolean;
  detailError: string | null;
  saving: boolean;
  cleanupRunning?: boolean;
  deletingRequest?: boolean;
  onRetry: () => void;
  onForceLogout: (userId: number) => Promise<boolean>;
  onUpdateRoles: (userId: number, roles: string[]) => Promise<boolean>;
  fetchUserMonitoring: (userId: number) => Promise<OrgAdminMonitoringResponse | null>;
  onFetchAzureCost: (userId: number, options?: { refresh?: boolean }) => Promise<OrgAdminUserAzureCost | null>;
  onFetchSharedAzureCost?: (options?: { refresh?: boolean }) => Promise<OrgAdminSharedAzureCostSummary | null>;
  onRenewBudget: (userId: number, topUpAmount: number) => Promise<boolean>;
  onToggleCleanup: (userId: number, disabled: boolean) => Promise<boolean>;
  onManualCleanup: (userId: number) => Promise<boolean>;
  onRequestCleanup?: () => Promise<boolean>;
  onUnblock?: (userId: number) => Promise<boolean>;
  onUnblockAll?: () => Promise<boolean>;
  onBlockAll?: () => Promise<boolean>;
  onAddUser?: (count: number) => Promise<boolean>;
  onDeleteUser?: (userId: number) => Promise<boolean>;
  onDeleteRequest?: () => Promise<boolean>;
  onExtendExpiration?: (expiresAt: string) => Promise<boolean>;
  onSendPurchaseConfirmationMail?: () => Promise<boolean>;
  onReprovisionRoles: () => Promise<boolean>;
  onPrivilegedRolesChanged?: () => void;
  lastUpdatedAt?: Date | null;
  isRefreshing?: boolean;
  hasActiveUsers?: boolean;
}

export function OrgAdminRequestDetailPanel({
  request,
  requestDetail,
  users,
  availableRoles,
  loading,
  detailError,
  saving,
  cleanupRunning = false,
  deletingRequest = false,
  onRetry,
  onForceLogout,
  onUpdateRoles,
  fetchUserMonitoring,
  onFetchAzureCost,
  onFetchSharedAzureCost,
  onRenewBudget,
  onToggleCleanup,
  onManualCleanup,
  onRequestCleanup,
  onUnblock,
  onUnblockAll,
  onBlockAll,
  onAddUser,
  onDeleteUser,
  onDeleteRequest,
  onExtendExpiration,
  onSendPurchaseConfirmationMail,
  onReprovisionRoles,
  onPrivilegedRolesChanged,
  lastUpdatedAt = null,
  isRefreshing = false,
  hasActiveUsers = false,
}: OrgAdminRequestDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('users');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [sendingMail, setSendingMail] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendValue, setExtendValue] = useState('');
  const [extending, setExtending] = useState(false);
  const [, setClockTick] = useState(0);

  const currentExpiry = useMemo(
    () => resolveCurrentExpiry(request, requestDetail),
    [request, requestDetail]
  );

  const currentStart = useMemo(
    () => resolveCurrentStart(request, requestDetail),
    [request, requestDetail]
  );

  useEffect(() => {
    if (!lastUpdatedAt) return undefined;
    const intervalId = window.setInterval(() => {
      setClockTick((tick) => tick + 1);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [lastUpdatedAt]);

  useEffect(() => {
    if (!extendOpen) return;
    const base = currentExpiry && currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
    setExtendValue(toDateTimeLocalValue(new Date(base.getTime() + 24 * 60 * 60 * 1000)));
  }, [extendOpen, currentExpiry]);

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

  const handleDeleteRequest = async () => {
    if (!onDeleteRequest) return;

    const confirmed = window.confirm(
      `Delete request #${request.id} permanently?\n\nThis will:\n• Delete all ${request.userCount} Azure user account(s)\n• Remove all RBAC role assignments\n• Delete all resource groups\n• Remove the request from the database\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    await onDeleteRequest();
  };

  const handleSendConfirmationMail = async () => {
    if (!onSendPurchaseConfirmationMail) return;

    const confirmed = window.confirm(
      `Send purchase confirmation mail to ${request.customerEmail}?\n\nThey will get Yes/No buttons to continue with a full Azure purchase.`
    );
    if (!confirmed) return;

    setSendingMail(true);
    try {
      await onSendPurchaseConfirmationMail();
    } finally {
      setSendingMail(false);
    }
  };

  const applyPreset = (hours: number) => {
    const base = currentExpiry && currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
    setExtendValue(toDateTimeLocalValue(new Date(base.getTime() + hours * 60 * 60 * 1000)));
  };

  const handleExtendExpiration = async () => {
    if (!onExtendExpiration || !extendValue) return;

    const next = new Date(extendValue);
    if (Number.isNaN(next.getTime())) {
      window.alert('Pick a valid date and time.');
      return;
    }

    if (currentExpiry && next.getTime() <= currentExpiry.getTime()) {
      window.alert('New expiration must be after the current expiration.');
      return;
    }

    if (next.getTime() <= Date.now()) {
      window.alert('New expiration must be in the future.');
      return;
    }

    const confirmed = window.confirm(
      `Extend expiration for request #${request.id} to ${next.toLocaleString()}?`
    );
    if (!confirmed) return;

    setExtending(true);
    try {
      const ok = await onExtendExpiration(next.toISOString());
      if (ok) setExtendOpen(false);
    } finally {
      setExtending(false);
    }
  };

  const infoItems = [
    {
      label: 'Project',
      value: request.projectName?.trim() || requestDetail?.projectName?.trim() || `Project ${request.id}`,
    },
    { label: 'Customer', value: request.customerEmail },
    { label: 'Region', value: request.region || '—' },
    {
      label: 'Starts',
      value: currentStart
        ? currentStart.toLocaleString(undefined, {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—',
    },
    {
      label: 'Expires',
      value: currentExpiry
        ? currentExpiry.toLocaleString(undefined, {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—',
    },
    {
      label: 'Users',
      value:
        requestDetail?.accountCount != null && requestDetail.accountCount > 0
          ? `${users.length} / ${requestDetail.accountCount}`
          : String(users.length || request.userCount),
    },
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

  const isTestIds =
    request.idMode === 'test_ids' || requestDetail?.idMode === 'test_ids';

  return (
    <div className="overflow-hidden rounded-b-xl border border-t-0 border-[#B91C1C]/30 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          {isTestIds ? (
            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
              Test ID
            </span>
          ) : null}
        </div>
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
            disabled={saving || extending}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} />
            Fix Roles
          </button>
          {onExtendExpiration ? (
            <button
              type="button"
              onClick={() => setExtendOpen((open) => !open)}
              disabled={saving || extending}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                extendOpen
                  ? 'border-[#B91C1C]/40 bg-[#B91C1C]/10 text-[#B91C1C]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Extend expiration
            </button>
          ) : null}
          {hasActiveUsers && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Live
            </span>
          )}
          {isRefreshing && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Refreshing...
            </span>
          )}
          {lastUpdatedAt && !isRefreshing && (
            <span className="text-xs text-gray-400">
              Last updated:{' '}
              {Math.max(0, Math.round((Date.now() - lastUpdatedAt.getTime()) / 1000))}s ago
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {isTestIds && onSendPurchaseConfirmationMail ? (
              <button
                type="button"
                onClick={() => void handleSendConfirmationMail()}
                disabled={saving || sendingMail || extending}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingMail ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                {sendingMail ? 'Sending…' : 'Send confirmation mail'}
              </button>
            ) : null}
            {onDeleteRequest && (
              <button
                type="button"
                onClick={() => void handleDeleteRequest()}
                disabled={deletingRequest || sendingMail || extending}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingRequest ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {deletingRequest ? 'Deleting from Azure...' : 'Delete Request'}
              </button>
            )}
          </div>
        </div>

        {extendOpen && onExtendExpiration ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-800">New expiration date & time</p>
              <p className="text-[11px] text-gray-500">
                Current: {currentExpiry ? currentExpiry.toLocaleString() : 'not set'}
              </p>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {EXTEND_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.hours)}
                  disabled={extending || saving}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="datetime-local"
                value={extendValue}
                onChange={(event) => setExtendValue(event.target.value)}
                disabled={extending || saving}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 sm:max-w-xs"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleExtendExpiration()}
                  disabled={extending || saving || !extendValue}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#B91C1C] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {extending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {extending ? 'Saving…' : 'Confirm extend'}
                </button>
                <button
                  type="button"
                  onClick={() => setExtendOpen(false)}
                  disabled={extending}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1">
          {(
            [
              { id: 'users' as const, label: 'Users' },
              { id: 'history' as const, label: 'History' },
              { id: 'cleanup' as const, label: 'Cleanup' },
              { id: 'budget' as const, label: 'Budget' },
              { id: 'custom-config' as const, label: 'Custom Roles & Services' },
              { id: 'privileged-roles' as const, label: 'Privileged Roles' },
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
                cleanupRunning={cleanupRunning}
                isRefreshing={isRefreshing}
                lastUpdatedAt={lastUpdatedAt}
                hasActiveUsers={hasActiveUsers}
                onSelect={setSelectedUserId}
                onForceLogout={onForceLogout}
                onUnblock={onUnblock}
                onUnblockAll={onUnblockAll}
                onBlockAll={onBlockAll}
                onAddUser={onAddUser}
                onDeleteUser={onDeleteUser}
                onTriggerCleanup={onManualCleanup}
                onRequestCleanup={onRequestCleanup}
                onUpdateRoles={onUpdateRoles}
                fetchUserMonitoring={fetchUserMonitoring}
                onFetchAzureCost={onFetchAzureCost}
                onFetchSharedAzureCost={onFetchSharedAzureCost}
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
              onRequestCleanup={onRequestCleanup}
              cleanupRunning={cleanupRunning}
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

          {activeTab === 'history' && (
            <OrgAdminHistoryTab requestId={request.id} users={users} />
          )}

          {activeTab === 'custom-config' && (
            <RequestCustomConfigTab requestId={request.id} users={users} />
          )}

          {activeTab === 'privileged-roles' && (
            <OrgAdminPrivilegedRolesTab
              requestId={request.id}
              users={users}
              onAssigned={onPrivilegedRolesChanged}
            />
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
