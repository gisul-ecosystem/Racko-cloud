'use client';

import { Fragment, useEffect, useState } from 'react';

import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Loader2,
  LogOut,
  ShieldOff,
  Trash2,
  Users,
} from 'lucide-react';

import { getOrgDailyUsage, getOrgUserSessions } from '../../api/orgAdminClient';

import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';

import { RequestStatusBadge } from '../RequestStatusBadge';

import { formatDateTime, formatMinutes } from '../../utils/formatters';

import type {
  OrgAdminAzureRoleOption,
  OrgAdminDailyUsageEntry,
  OrgAdminLiveAzureResource,
  OrgAdminRequestDetail,
  OrgAdminUser,
  OrgAdminUserAzureCost,
  OrgAdminUserSession,
} from '../../types/orgAdmin';

import { OrgAdminUserUsageModal } from './OrgAdminUserUsageModal';

interface OrgAdminUsersTableProps {
  users: OrgAdminUser[];
  request: OrgAdminRequestDetail | null;
  requestId: number | null;
  availableRoles: OrgAdminAzureRoleOption[];
  loading: boolean;
  selectedUserId: number | null;
  saving: boolean;
  isRefreshing?: boolean;
  lastUpdatedAt?: Date | null;
  hasActiveUsers?: boolean;
  onSelect: (userId: number) => void;
  onForceLogout: (userId: number) => Promise<boolean>;
  onUnblock?: (userId: number) => Promise<boolean>;
  onTriggerCleanup?: (userId: number) => Promise<boolean>;
  onUpdateRoles: (userId: number, roles: string[]) => Promise<boolean>;
  fetchUserMonitoring: (userId: number) => Promise<import('../../types/orgAdmin').OrgAdminMonitoringResponse | null>;
  onFetchAzureCost: (userId: number, options?: { refresh?: boolean }) => Promise<OrgAdminUserAzureCost | null>;
  embedded?: boolean;
}

function truncateAzureId(id: string | null | undefined): string {
  if (!id) return '—';
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}…`;
}

function formatEndedReason(reason: string | null | undefined): string {
  if (!reason) return 'User logout';
  const map: Record<string, string> = {
    daily_limit_reached: 'Daily limit',
    stale_signin: 'Stale session',
    force_logout: 'Force logout',
    admin_force_logout: 'Admin logout',
    closed: 'Session closed',
  };
  return map[reason] || reason.replace(/_/g, ' ');
}

function formatSessionCost(minutes: number | null, hourlyRate: number): string {
  if (minutes == null || minutes <= 0 || hourlyRate <= 0) return '$0.00';
  return `$${((minutes / 60) * hourlyRate).toFixed(2)}`;
}

function DailyUsageBar({ usage }: { usage: OrgAdminDailyUsageEntry }) {
  if (usage.dailyLimitHours === null) {
    return <p className="mt-1 text-[11px] text-gray-400">No daily limit set</p>;
  }

  const limitMinutes = usage.dailyLimitHours * 60;
  const pct = Math.min(100, Math.round((usage.consumedMinutes / limitMinutes) * 100));
  const isLimitReached = usage.limitReached || usage.remainingMinutes === 0;

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{usage.consumedFormatted} used</span>
        <span className="mx-1 text-gray-300">·</span>
        {isLimitReached ? (
          <span className="font-medium text-red-600">Daily limit reached</span>
        ) : (
          <span className="text-emerald-600">{usage.remainingFormatted} remaining</span>
        )}
        <span className="mx-1 text-gray-300">·</span>
        <span className="text-gray-400">Limit: {usage.dailyLimitHours}h/day</span>
        {usage.todayWindow && (
          <span className="text-gray-400">
            {' '}
            ({usage.todayWindow.start.slice(0, 5)} – {usage.todayWindow.end.slice(0, 5)})
          </span>
        )}
      </div>

      <div className="h-1 w-[200px] overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            isLimitReached ? 'bg-red-600' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TimeSpentCell({ user }: { user: OrgAdminUser }) {
  const usedTodayMinutes = user.usedTodayMinutes ?? user.todayMinutes ?? 0;
  const liveSessionMins = user.activeSessionMinutes ?? user.liveSessionMins ?? 0;
  const remainingMins = user.remainingMinutes;
  const limitReached = user.dailyLimitReached === true;

  if (limitReached) {
    return (
      <div>
        <p className="font-medium text-red-600">{formatMinutes(usedTodayMinutes)} used today</p>
        <p className="text-[11px] text-red-500">Limit reached — blocked for today</p>
      </div>
    );
  }

  if (usedTodayMinutes <= 0 && !user.hasActiveSession) {
    return <span className="text-gray-400">0 min used today</span>;
  }

  return (
    <div>
      <p className="font-medium text-gray-900">{formatMinutes(usedTodayMinutes)} used today</p>
      {remainingMins != null && user.dailyLimitMinutes > 0 && (
        <p className="text-[11px] text-gray-500">{formatMinutes(remainingMins)} remaining</p>
      )}
      {user.hasActiveSession && liveSessionMins > 0 && (
        <p className="mt-0.5 text-[11px] text-green-700">{formatMinutes(liveSessionMins)} in current session</p>
      )}
    </div>
  );
}

function LiveCostCell({ user }: { user: OrgAdminUser }) {
  const hourlyRate = user.hourlyRate ?? user.hourlyResourceRate ?? 0;
  const liveCost = user.liveCost ?? 0;
  const totalCostToday = user.totalCostToday ?? liveCost;
  const isActive = user.hasActiveSession === true;

  if (totalCostToday <= 0 && liveCost <= 0) {
    return (
      <div title={hourlyRate > 0 ? `at $${hourlyRate.toFixed(2)}/hr` : undefined}>
        <p className="text-sm text-gray-400">$0.00</p>
      </div>
    );
  }

  if (isActive) {
    return (
      <div title={`at $${hourlyRate.toFixed(2)}/hr`}>
        <p className="text-sm font-semibold text-orange-600">${totalCostToday.toFixed(2)} (live)</p>
        {user.closedSessionCost != null && user.closedSessionCost > 0 && (
          <p className="text-[11px] text-gray-400">${user.closedSessionCost.toFixed(2)} from earlier sessions</p>
        )}
      </div>
    );
  }

  return (
    <div title={`at $${hourlyRate.toFixed(2)}/hr`}>
      <p className="text-sm font-semibold text-gray-600">${totalCostToday.toFixed(2)} today</p>
    </div>
  );
}

function AzureCostCell({
  user,
  azureCost,
  loadingAzureCost,
  onRefresh,
}: {
  user: OrgAdminUser;
  azureCost?: OrgAdminUserAzureCost;
  loadingAzureCost: boolean;
  onRefresh: (event: React.MouseEvent) => void;
}) {
  const azureCostMtd = azureCost?.monthToDateCost ?? user.azureCostMtd ?? 0;
  const budget = user.totalBudget ?? user.perUserBudgetUsd ?? null;
  const syncedAt = azureCost?.queriedAt || user.lastCostSyncedAt;
  const syncError = user.syncError;
  const pct =
    budget != null && budget > 0 ? Math.min(100, Math.round((azureCostMtd / budget) * 100)) : null;

  return (
    <div>
      <span
        className={`text-[13px] font-semibold ${
          user.budgetExceeded ? 'text-red-600' : 'text-violet-900'
        }`}
      >
        ${azureCostMtd.toFixed(2)}
      </span>
      <span className="text-[11px] text-gray-500"> MTD</span>
      {budget != null && budget > 0 && (
        <p className="text-[11px] text-gray-500">of ${budget.toFixed(2)} budget</p>
      )}
      {pct != null && (
        <div className="mt-1 h-1 w-[80px] overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-violet-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {syncedAt && (
        <p className="text-[10px] text-gray-400">
          Last synced: {new Date(syncedAt).toLocaleTimeString()}
        </p>
      )}
      {syncError && (
        <p
          className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700"
          title={syncError}
        >
          <AlertTriangle className="h-3 w-3" />
          Sync failed
        </p>
      )}
      {loadingAzureCost && <p className="mt-0.5 text-[10px] text-amber-700">Refreshing...</p>}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loadingAzureCost}
        className="mt-1 text-[10px] font-medium text-violet-700 hover:underline disabled:opacity-50"
      >
        Refresh
      </button>
      {user.budgetExceeded && (
        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
          Exceeded
        </span>
      )}
    </div>
  );
}

function ResourcesCell({
  resources,
  liveCount,
  peakCount,
  expanded,
  onToggle,
}: {
  resources: OrgAdminLiveAzureResource[];
  liveCount: number;
  peakCount: number;
  expanded: boolean;
  onToggle: (event: React.MouseEvent) => void;
}) {
  const canExpand = resources.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        className={`inline-flex items-center gap-1 text-left ${canExpand ? 'cursor-pointer hover:text-violet-800' : 'cursor-default'}`}
        disabled={!canExpand}
      >
        {canExpand && (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
        <span className="font-medium text-gray-900">
          {liveCount} live{peakCount > 0 ? ` · peak: ${peakCount}` : ''}
        </span>
      </button>
      {expanded && resources.length > 0 && (
        <div className="mt-2 max-h-40 overflow-auto rounded border border-gray-100 bg-gray-50">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="px-2 py-1 font-medium">Type</th>
                <th className="px-2 py-1 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id || resource.name} className="border-b border-gray-100 last:border-0">
                  <td className="max-w-[120px] truncate px-2 py-1 font-mono text-gray-800">{resource.name}</td>
                  <td className="px-2 py-1 text-gray-600">{resource.type}</td>
                  <td className="px-2 py-1 text-gray-500">{resource.provisioningState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SessionCell({ user }: { user: OrgAdminUser }) {
  const displayStatus = user.displayStatus ?? user.status;
  const isOnline = user.isOnline ?? user.hasActiveSession;
  const isBlocked = displayStatus === 'Blocked';

  return (
    <div>
      <span
        className={`inline-flex items-center gap-1.5 text-xs ${
          isOnline ? 'font-medium text-green-700' : isBlocked ? 'font-medium text-red-700' : 'text-gray-500'
        }`}
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            isOnline ? 'animate-pulse bg-green-500' : isBlocked ? 'bg-red-500' : 'bg-gray-400'
          }`}
        />
        {isOnline ? 'Online' : isBlocked ? 'Blocked' : 'Offline'}
      </span>
      {isOnline && user.sessionStartedAt && (
        <p className="mt-0.5 text-[11px] text-gray-400">
          Since {new Date(user.sessionStartedAt).toLocaleTimeString()}
        </p>
      )}
      {!isOnline && user.lastSeenAt && (
        <p className="mt-0.5 text-[11px] text-gray-400">
          Last {new Date(user.lastSeenAt).toLocaleTimeString()}
        </p>
      )}
      {!isOnline && !user.lastSeenAt && user.lastLoginAt && (
        <p className="mt-0.5 text-[11px] text-gray-400">Last {formatDateTime(user.lastLoginAt)}</p>
      )}
      {(user.totalSessionsToday ?? 0) > 0 && (
        <p className="mt-0.5 text-[11px] text-gray-400">
          {user.totalSessionsToday} session{user.totalSessionsToday !== 1 ? 's' : ''} today
        </p>
      )}
    </div>
  );
}

function RoleBadges({ roles }: { roles: OrgAdminUser['roles'] }) {
  if (roles.length === 0) {
    return <span className="text-xs text-gray-400">No roles</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((entry) => (
        <span
          key={`${entry.role}-${entry.scope || 'default'}`}
          title={entry.scope ? `Scope: ${entry.scope}` : undefined}
          className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-800"
        >
          {entry.role}
        </span>
      ))}
    </div>
  );
}

function RoleSelect({
  user,
  availableRoles,
  disabled,
  onChange,
}: {
  user: OrgAdminUser;
  availableRoles: OrgAdminAzureRoleOption[];
  disabled: boolean;
  onChange: (roleName: string) => void;
}) {
  const currentRole = user.roles[0]?.role ?? '';

  return (
    <select
      className="mt-1 max-w-[180px] rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 shadow-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
      value={currentRole}
      disabled={disabled || availableRoles.length === 0}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        const nextRole = event.target.value;
        if (nextRole && nextRole !== currentRole) {
          onChange(nextRole);
        }
      }}
    >
      {!currentRole && <option value="">Select role</option>}
      {availableRoles.map((role) => (
        <option key={role.definitionId} value={role.name}>
          {role.name}
        </option>
      ))}
      {currentRole && !availableRoles.some((role) => role.name === currentRole) && (
        <option value={currentRole}>{currentRole}</option>
      )}
    </select>
  );
}

function SessionHistoryPanel({
  requestId,
  user,
  onClose,
}: {
  requestId: number;
  user: OrgAdminUser;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<OrgAdminUserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const hourlyRate = user.hourlyRate ?? user.hourlyResourceRate ?? 0;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const response = await getOrgUserSessions(requestId, user.id);
        if (!cancelled && response.success) {
          setSessions(response.sessions);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId, user.id]);

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3" onClick={(event) => event.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Session history — {user.username}</p>
        <button type="button" onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading sessions...
        </div>
      ) : sessions.length === 0 ? (
        <p className="py-2 text-xs text-gray-400">No sessions in the last 7 days.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-1 pr-3 font-medium">Login</th>
                <th className="py-1 pr-3 font-medium">Logout</th>
                <th className="py-1 pr-3 font-medium">Duration</th>
                <th className="py-1 pr-3 font-medium">Cost</th>
                <th className="py-1 font-medium">Ended by</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 pr-3 text-gray-800">
                    {new Date(session.loginAt).toLocaleTimeString()}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600">
                    {session.isActive ? 'Active' : session.logoutAt ? new Date(session.logoutAt).toLocaleTimeString() : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-700">
                    {session.minutesUsed != null ? formatMinutes(session.minutesUsed) : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-700">
                    {formatSessionCost(session.minutesUsed, hourlyRate)}
                  </td>
                  <td className="py-1.5 text-gray-500">
                    {session.isActive ? '—' : formatEndedReason(session.endedReason)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function secondsAgo(date: Date | null | undefined): string {
  if (!date) return '';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export function OrgAdminUsersTable({
  users,
  request,
  requestId,
  availableRoles,
  loading,
  selectedUserId,
  saving,
  isRefreshing = false,
  lastUpdatedAt = null,
  hasActiveUsers = false,
  onSelect,
  onForceLogout,
  onUnblock,
  onTriggerCleanup,
  onUpdateRoles,
  fetchUserMonitoring,
  onFetchAzureCost,
  embedded = false,
}: OrgAdminUsersTableProps) {
  const [usageUser, setUsageUser] = useState<OrgAdminUser | null>(null);
  const [loggingOutUserId, setLoggingOutUserId] = useState<number | null>(null);
  const [unblockingUserId, setUnblockingUserId] = useState<number | null>(null);
  const [cleanupUserId, setCleanupUserId] = useState<number | null>(null);
  const [roleChangingUserId, setRoleChangingUserId] = useState<number | null>(null);
  const [azureCosts, setAzureCosts] = useState<Record<number, OrgAdminUserAzureCost>>({});
  const [loadingAzureCostUserId, setLoadingAzureCostUserId] = useState<number | null>(null);
  const [dailyUsage, setDailyUsage] = useState<Record<number, OrgAdminDailyUsageEntry>>({});
  const [expandedResourcesUserId, setExpandedResourcesUserId] = useState<number | null>(null);
  const [expandedSessionsUserId, setExpandedSessionsUserId] = useState<number | null>(null);

  const showUsageTracking = Boolean(
    request?.enableDailyUsage || request?.hasUsageWindows || request?.dailyLimitMinutes
  );

  useEffect(() => {
    if (!requestId || !showUsageTracking) return undefined;

    const fetchDailyUsage = async () => {
      try {
        const response = await getOrgDailyUsage(requestId);
        if (response.success && response.data) {
          const map: Record<number, OrgAdminDailyUsageEntry> = {};
          response.data.forEach((entry) => {
            map[entry.userId] = entry;
          });
          setDailyUsage(map);
        }
      } catch (err) {
        console.error('Failed to fetch daily usage:', err);
      }
    };

    void fetchDailyUsage();
    const interval = window.setInterval(() => {
      void fetchDailyUsage();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [requestId, showUsageTracking]);

  useEffect(() => {
    if (users.length === 0) return;

    const initialCosts: Record<number, OrgAdminUserAzureCost> = {};
    for (const user of users) {
      if (user.azureCostMtd != null || user.lastCostSyncedAt) {
        initialCosts[user.id] = {
          userId: user.id,
          username: user.username,
          resourceGroup: user.resourceGroup || '',
          costingMode: request?.costingMode || 'shared',
          attributionMethod: 'direct',
          monthToDateCost: user.azureCostMtd ?? 0,
          lifetimeCost: user.azureCostLifetime ?? user.azureCostMtd ?? 0,
          currency: user.costCurrency || 'USD',
          resourceGroupTotalCost: null,
          sharePercent: null,
          dataFreshnessNote: '',
          queriedAt: user.lastCostSyncedAt || new Date().toISOString(),
          fromCache: true,
        };
      }
    }

    if (Object.keys(initialCosts).length > 0) {
      setAzureCosts((current) => ({ ...initialCosts, ...current }));
    }
  }, [users, request?.costingMode]);

  async function handleFetchAzureCost(event: React.MouseEvent, user: OrgAdminUser) {
    event.stopPropagation();
    setLoadingAzureCostUserId(user.id);

    try {
      const cost = await onFetchAzureCost(user.id, { refresh: true });
      if (cost) {
        setAzureCosts((current) => ({ ...current, [user.id]: cost }));
      }
    } finally {
      setLoadingAzureCostUserId(null);
    }
  }

  async function handleForceLogout(event: React.MouseEvent, user: OrgAdminUser) {
    event.stopPropagation();
    if (!confirm(`Force logout "${user.username}"?`)) return;

    setLoggingOutUserId(user.id);
    try {
      await onForceLogout(user.id);
    } finally {
      setLoggingOutUserId(null);
    }
  }

  async function handleUnblock(event: React.MouseEvent, user: OrgAdminUser) {
    event.stopPropagation();
    if (!onUnblock) return;
    if (!confirm(`Unblock "${user.username}" and re-enable their Azure account?`)) return;

    setUnblockingUserId(user.id);
    try {
      await onUnblock(user.id);
    } finally {
      setUnblockingUserId(null);
    }
  }

  async function handleCleanup(event: React.MouseEvent, user: OrgAdminUser) {
    event.stopPropagation();
    if (!onTriggerCleanup) return;
    if (!confirm(`Run cleanup for "${user.username}"? This deletes resources in their resource group.`)) return;

    setCleanupUserId(user.id);
    try {
      await onTriggerCleanup(user.id);
    } finally {
      setCleanupUserId(null);
    }
  }

  async function handleRoleChange(userId: number, roleName: string) {
    setRoleChangingUserId(userId);
    try {
      await onUpdateRoles(userId, [roleName]);
    } finally {
      setRoleChangingUserId(null);
    }
  }

  if (loading) {
    if (embedded) {
      return <TableSkeleton rows={4} cols={9} embedded />;
    }

    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        </div>
        <TableSkeleton rows={4} cols={9} embedded />
      </div>
    );
  }

  if (users.length === 0) {
    if (embedded) {
      return (
        <div className="py-10 text-center text-sm text-gray-500">No provisioned users yet.</div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
        <Users className="mb-4 h-10 w-10 text-gray-300" />
        <h3 className="text-base font-semibold text-gray-900">No users</h3>
        <p className="mt-1 text-sm text-gray-500">Provisioned users will appear here.</p>
      </div>
    );
  }

  const isPerUser = request?.costingMode === 'per_user';
  const colCount = isPerUser ? 10 : 9;

  const tableContent = (
    <div className={embedded ? '' : 'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm'}>
      {!embedded && (
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Provisioned Users</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {hasActiveUsers
                  ? 'Live session data refreshes every 10 seconds.'
                  : 'User data refreshes every 30 seconds when this panel is open.'}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
              {hasActiveUsers && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  Live
                </span>
              )}
              {isRefreshing && (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Refreshing...
                </span>
              )}
              {lastUpdatedAt && !isRefreshing && (
                <span>Last updated: {secondsAgo(lastUpdatedAt)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-medium">Username</th>
              {isPerUser && <th className="px-4 py-3 font-medium">Resource group</th>}
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Resources</th>
              <th className="px-4 py-3 font-medium">Time spent</th>
              <th className="px-4 py-3 font-medium">Live cost</th>
              <th className="px-4 py-3 font-medium">Azure cost</th>
              <th className="px-4 py-3 font-medium">Session</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const selected = selectedUserId === user.id;
              const loggingOut = loggingOutUserId === user.id;
              const unblocking = unblockingUserId === user.id;
              const cleaningUp = cleanupUserId === user.id;
              const roleChanging = roleChangingUserId === user.id;
              const azureCost = azureCosts[user.id];
              const loadingAzureCost = loadingAzureCostUserId === user.id;
              const displayStatus = user.displayStatus ?? user.status;
              const liveResources = user.liveResources ?? [];
              const liveResourceCount = user.liveResourceCount ?? user.resourceCount ?? liveResources.length;
              const peakResourceCount = user.peakResourceCount ?? 0;
              const resourcesExpanded = expandedResourcesUserId === user.id;
              const sessionsExpanded = expandedSessionsUserId === user.id;
              const isBlocked = displayStatus === 'Blocked';

              return (
                <Fragment key={user.id}>
                  <tr
                    onClick={() => onSelect(user.id)}
                    className={`cursor-pointer border-b border-gray-50 transition hover:bg-gray-50 ${
                      selected ? 'bg-red-50/60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{user.username}</p>
                      <p className="font-mono text-xs text-gray-500" title={user.azureUserId || undefined}>
                        {truncateAzureId(user.azureUserId)}
                      </p>
                      {user.dailyLimitReached && (
                        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
                          Daily limit reached
                        </span>
                      )}
                      {(showUsageTracking ? dailyUsage[user.id] : null) && (
                        <DailyUsageBar usage={dailyUsage[user.id]!} />
                      )}
                    </td>

                    {isPerUser && (
                      <td className="px-4 py-3">
                        <p className="max-w-[180px] truncate font-mono text-xs text-violet-800">
                          {user.resourceGroup || '—'}
                        </p>
                      </td>
                    )}

                    <td className="px-4 py-3">
                      <RequestStatusBadge status={displayStatus} />
                    </td>

                    <td className="px-4 py-3 text-gray-700">
                      <ResourcesCell
                        resources={liveResources}
                        liveCount={liveResourceCount}
                        peakCount={peakResourceCount}
                        expanded={resourcesExpanded}
                        onToggle={(event) => {
                          event.stopPropagation();
                          setExpandedResourcesUserId((current) =>
                            current === user.id ? null : user.id
                          );
                        }}
                      />
                    </td>

                    <td className="px-4 py-3 text-gray-700">
                      <TimeSpentCell user={user} />
                    </td>

                    <td className="px-4 py-3">
                      <LiveCostCell user={user} />
                    </td>

                    <td className="px-4 py-3">
                      <AzureCostCell
                        user={user}
                        azureCost={azureCost}
                        loadingAzureCost={loadingAzureCost}
                        onRefresh={(event) => void handleFetchAzureCost(event, user)}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <SessionCell user={user} />
                    </td>

                    <td className="px-4 py-3">
                      <RoleBadges roles={user.roles} />
                      <RoleSelect
                        user={user}
                        availableRoles={availableRoles}
                        disabled={roleChanging || saving}
                        onChange={(roleName) => void handleRoleChange(user.id, roleName)}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {user.hasActiveSession && (
                          <button
                            type="button"
                            onClick={(event) => void handleForceLogout(event, user)}
                            disabled={saving || loggingOut}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                            title="Force logout"
                          >
                            {loggingOut ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <LogOut className="h-3.5 w-3.5" />
                            )}
                            Logout
                          </button>
                        )}
                        {isBlocked && onUnblock && (
                          <button
                            type="button"
                            onClick={(event) => void handleUnblock(event, user)}
                            disabled={saving || unblocking}
                            className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-800 transition hover:bg-green-100 disabled:opacity-50"
                            title="Unblock user"
                          >
                            {unblocking ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ShieldOff className="h-3.5 w-3.5" />
                            )}
                            Unblock
                          </button>
                        )}
                        {onTriggerCleanup && (
                          <button
                            type="button"
                            onClick={(event) => void handleCleanup(event, user)}
                            disabled={saving || cleaningUp}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                            title="Run cleanup for this user"
                          >
                            {cleaningUp ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Cleanup
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedSessionsUserId((current) =>
                              current === user.id ? null : user.id
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:border-[#B91C1C]/30 hover:bg-red-50 hover:text-[#B91C1C]"
                          title="View session history"
                        >
                          <Activity className="h-3.5 w-3.5" />
                          Sessions
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setUsageUser(user);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                          title="View usage details"
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                  {sessionsExpanded && requestId != null && (
                    <tr>
                      <td colSpan={colCount} className="p-0">
                        <SessionHistoryPanel
                          requestId={requestId}
                          user={user}
                          onClose={() => setExpandedSessionsUserId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      {tableContent}

      {usageUser && request && (
        <OrgAdminUserUsageModal
          user={usageUser}
          request={request}
          fetchMonitoring={() => fetchUserMonitoring(usageUser.id)}
          onClose={() => setUsageUser(null)}
        />
      )}
    </>
  );
}
