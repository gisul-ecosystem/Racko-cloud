'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Loader2,
  LogOut,
  Search,
  ShieldOff,
  Trash2,
  UserX,
  Users,
} from 'lucide-react';

import { getOrgDailyUsage, getOrgUserSessions } from '../../api/orgAdminClient';

import { RequestStatusBadge } from '../RequestStatusBadge';

import {
  computeClientLiveCost,
  getMinutesTodayForDisplay,
} from '../../utils/costDisplayUtils';
import { formatDateTime, formatMinutes } from '../../utils/formatters';

import type {
  OrgAdminAzureRoleOption,
  OrgAdminDailyUsageEntry,
  OrgAdminLiveAzureResource,
  OrgAdminRequestDetail,
  OrgAdminSharedAzureCostSummary,
  OrgAdminUser,
  OrgAdminUserAzureCost,
  OrgAdminUserSession,
} from '../../types/orgAdmin';

import { OrgAdminUserUsageModal } from './OrgAdminUserUsageModal';
import { SharedCostSummaryCard } from './SharedCostSummaryCard';
import { UserCostCell } from './UserCostCell';

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
  onDeleteUser?: (userId: number) => Promise<boolean>;
  onTriggerCleanup?: (userId: number) => Promise<boolean>;
  onUpdateRoles: (userId: number, roles: string[]) => Promise<boolean>;
  fetchUserMonitoring: (userId: number) => Promise<import('../../types/orgAdmin').OrgAdminMonitoringResponse | null>;
  onFetchAzureCost: (userId: number, options?: { refresh?: boolean }) => Promise<OrgAdminUserAzureCost | null>;
  onFetchSharedAzureCost?: (options?: { refresh?: boolean }) => Promise<OrgAdminSharedAzureCostSummary | null>;
  embedded?: boolean;
}

const PAGE_SIZES = [25, 50, 100] as const;
type StatusFilter = 'all' | 'online' | 'offline' | 'blocked' | 'active';

function UsersListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-36 animate-pulse rounded bg-gray-200" />
            <div className="hidden h-5 w-16 animate-pulse rounded-full bg-gray-200 sm:block" />
            <div className="ml-auto h-4 w-28 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
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
  const dailyLimitHit = usage.limitReached === true;
  const blockedForToday = usage.blockedForToday === true;
  const blockedLabel = usage.blockedReasonLabel;

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{usage.consumedFormatted} used</span>
        <span className="mx-1 text-gray-300">·</span>
        {dailyLimitHit ? (
          <span className="font-medium text-red-600">Daily limit reached</span>
        ) : usage.remainingMinutes != null && usage.remainingMinutes > 0 ? (
          <span className="text-emerald-600">{usage.remainingFormatted} remaining</span>
        ) : (
          <span className="text-gray-400">No time remaining</span>
        )}
        {blockedForToday && blockedLabel && !dailyLimitHit && (
          <>
            <span className="mx-1 text-gray-300">·</span>
            <span className="font-medium text-amber-700">{blockedLabel}</span>
          </>
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

      <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            dailyLimitHit ? 'bg-red-600' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-500'
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
  const dailyLimitHit = user.dailyLimitReached === true;
  const blockedForToday = user.blockedForToday === true;
  const blockedLabel = user.blockedReasonLabel;

  if (dailyLimitHit) {
    return (
      <div>
        <p className="font-medium text-red-600">{formatMinutes(usedTodayMinutes)} used today</p>
        <p className="text-[11px] text-red-500">Daily limit reached — blocked for today</p>
      </div>
    );
  }

  if (blockedForToday && blockedLabel) {
    return (
      <div>
        <p className="font-medium text-gray-900">{formatMinutes(usedTodayMinutes)} used today</p>
        {remainingMins != null && user.dailyLimitMinutes > 0 && (
          <p className="text-[11px] text-gray-500">{formatMinutes(remainingMins)} remaining</p>
        )}
        <p className="text-[11px] font-medium text-amber-700">{blockedLabel}</p>
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
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-md border border-gray-100 bg-white px-3 py-2 text-[11px]"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-gray-800">
                  {new Date(session.loginAt).toLocaleTimeString()}
                  {' → '}
                  {session.isActive
                    ? 'Active'
                    : session.logoutAt
                      ? new Date(session.logoutAt).toLocaleTimeString()
                      : '—'}
                </span>
                <span className="text-gray-500">
                  {session.minutesUsed != null ? formatMinutes(session.minutesUsed) : '—'}
                </span>
                <span className="text-gray-700">
                  {formatSessionCost(session.minutesUsed, hourlyRate)}
                </span>
                {!session.isActive && (
                  <span className="text-gray-400">{formatEndedReason(session.endedReason)}</span>
                )}
              </div>
            </div>
          ))}
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
  onDeleteUser,
  onTriggerCleanup,
  onUpdateRoles,
  fetchUserMonitoring,
  onFetchAzureCost,
  onFetchSharedAzureCost,
  embedded = false,
}: OrgAdminUsersTableProps) {
  const [usageUser, setUsageUser] = useState<OrgAdminUser | null>(null);
  const [loggingOutUserId, setLoggingOutUserId] = useState<number | null>(null);
  const [unblockingUserId, setUnblockingUserId] = useState<number | null>(null);
  const [cleanupUserId, setCleanupUserId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [roleChangingUserId, setRoleChangingUserId] = useState<number | null>(null);
  const [azureCosts, setAzureCosts] = useState<Record<number, OrgAdminUserAzureCost>>({});
  const [loadingAzureCostUserId, setLoadingAzureCostUserId] = useState<number | null>(null);
  const [sharedCostSummary, setSharedCostSummary] = useState<OrgAdminSharedAzureCostSummary | null>(null);
  const [loadingSharedCost, setLoadingSharedCost] = useState(false);
  const [expandedCostUserId, setExpandedCostUserId] = useState<number | null>(null);
  const [dailyUsage, setDailyUsage] = useState<Record<number, OrgAdminDailyUsageEntry>>({});
  const [expandedResourcesUserId, setExpandedResourcesUserId] = useState<number | null>(null);
  const [expandedSessionsUserId, setExpandedSessionsUserId] = useState<number | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const isSharedCosting = request?.costingMode === 'shared';

  const showUsageTracking = Boolean(
    request?.enableDailyUsage || request?.hasUsageWindows || request?.dailyLimitMinutes
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return users.filter((user) => {
      const displayStatus = user.displayStatus ?? user.status;
      const isOnline = user.isOnline ?? user.hasActiveSession;
      const isBlocked = displayStatus === 'Blocked';

      if (statusFilter === 'online' && !isOnline) return false;
      if (statusFilter === 'offline' && isOnline) return false;
      if (statusFilter === 'blocked' && !isBlocked) return false;
      if (statusFilter === 'active' && displayStatus !== 'Active') return false;

      if (!query) return true;

      const haystack = [user.username, user.resourceGroup, user.azureUserId, displayStatus]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [users, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const paginatedUsers = filteredUsers.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

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

  useEffect(() => {
    if (!isSharedCosting || !onFetchSharedAzureCost) {
      setSharedCostSummary(null);
      return undefined;
    }

    let cancelled = false;

    const loadSharedSummary = async () => {
      setLoadingSharedCost(true);
      try {
        const summary = await onFetchSharedAzureCost();
        if (cancelled || !summary) return;

        setSharedCostSummary(summary);
        const nextCosts: Record<number, OrgAdminUserAzureCost> = {};
        for (const entry of summary.users) {
          nextCosts[entry.userId] = entry;
        }
        setAzureCosts((current) => ({ ...current, ...nextCosts }));
      } finally {
        if (!cancelled) {
          setLoadingSharedCost(false);
        }
      }
    };

    void loadSharedSummary();

    return () => {
      cancelled = true;
    };
  }, [isSharedCosting, onFetchSharedAzureCost, requestId, users.length]);

  async function handleFetchSharedAzureCost(refresh = true) {
    if (!onFetchSharedAzureCost) return;

    setLoadingSharedCost(true);
    try {
      const summary = await onFetchSharedAzureCost({ refresh });
      if (!summary) return;

      setSharedCostSummary(summary);
      const nextCosts: Record<number, OrgAdminUserAzureCost> = {};
      for (const entry of summary.users) {
        nextCosts[entry.userId] = entry;
      }
      setAzureCosts((current) => ({ ...current, ...nextCosts }));
    } finally {
      setLoadingSharedCost(false);
    }
  }

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

  async function handleDeleteUser(event: React.MouseEvent, user: OrgAdminUser) {
    event.stopPropagation();
    if (!onDeleteUser) return;
    if (
      !confirm(
        `Delete user "${user.username}"?\n\nThis permanently removes their Azure account, RBAC assignments, and database record. This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingUserId(user.id);
    try {
      await onDeleteUser(user.id);
      if (expandedUserId === user.id) {
        setExpandedUserId(null);
      }
    } finally {
      setDeletingUserId(null);
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
      return <UsersListSkeleton rows={4} />;
    }

    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        </div>
        <UsersListSkeleton rows={4} />
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

  const listContent = (
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

      {isSharedCosting && (
        <SharedCostSummaryCard
          summary={sharedCostSummary}
          loading={loadingSharedCost}
          onRefresh={() => void handleFetchSharedAzureCost(true)}
        />
      )}

      <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by username, resource group, or ID..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="blocked">Blocked</option>
            </select>

            <select
              value={pageSize}
              onChange={(event) =>
                setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          {filteredUsers.length === 0
            ? 'No users match your filters'
            : filteredUsers.length === users.length
              ? `${users.length} user${users.length !== 1 ? 's' : ''} total`
              : `${filteredUsers.length} of ${users.length} users`}
          {filteredUsers.length > 0 && (
            <span>
              {' '}
              · showing {pageStart + 1}–{Math.min(pageStart + pageSize, filteredUsers.length)}
            </span>
          )}
        </p>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-gray-500">
          No users match your search or filter. Try clearing the search box.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {paginatedUsers.map((user) => {
            const selected = selectedUserId === user.id;
            const expanded = expandedUserId === user.id;
            const loggingOut = loggingOutUserId === user.id;
            const unblocking = unblockingUserId === user.id;
            const cleaningUp = cleanupUserId === user.id;
            const deletingUser = deletingUserId === user.id;
            const roleChanging = roleChangingUserId === user.id;
            const azureCost = azureCosts[user.id];
            const loadingAzureCost = loadingAzureCostUserId === user.id;
            const displayStatus = user.displayStatus ?? user.status;
            const liveResources = user.liveResources ?? [];
            const liveResourceCount =
              user.liveResourceCount ?? user.resourceCount ?? liveResources.length;
            const peakResourceCount = user.peakResourceCount ?? 0;
            const resourcesExpanded = expandedResourcesUserId === user.id;
            const sessionsExpanded = expandedSessionsUserId === user.id;
            const isBlocked = displayStatus === 'Blocked';
            const isOnline = user.isOnline ?? user.hasActiveSession;
            const minutesToday = getMinutesTodayForDisplay(user, nowMs);
            const liveCost = isSharedCosting
              ? (azureCost?.monthToDateCost ?? user.azureCostMtd ?? 0)
              : computeClientLiveCost(user, nowMs);
            const usedTodayMinutes = user.usedTodayMinutes ?? user.todayMinutes ?? 0;

            return (
              <div
                key={user.id}
                className={`transition ${selected ? 'bg-red-50/40' : 'bg-white hover:bg-gray-50/80'}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(user.id);
                    setExpandedUserId((current) => (current === user.id ? null : user.id));
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left sm:items-center sm:px-6"
                >
                  <span className="mt-0.5 shrink-0 text-gray-400 sm:mt-0">
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium text-gray-900">{user.username}</span>
                      <RequestStatusBadge status={displayStatus} />
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${
                          isOnline
                            ? 'font-medium text-green-700'
                            : isBlocked
                              ? 'font-medium text-red-700'
                              : 'text-gray-500'
                        }`}
                      >
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            isOnline
                              ? 'animate-pulse bg-green-500'
                              : isBlocked
                                ? 'bg-red-500'
                                : 'bg-gray-400'
                          }`}
                        />
                        {isOnline ? 'Online' : isBlocked ? 'Blocked' : 'Offline'}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                      <span className="font-mono" title={user.azureUserId || undefined}>
                        {truncateAzureId(user.azureUserId)}
                      </span>
                      {isPerUser && user.resourceGroup && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="truncate font-mono text-violet-800">{user.resourceGroup}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="hidden shrink-0 text-right text-xs text-gray-600 sm:block">
                    <p className="font-medium text-gray-800">
                      {formatMinutes(minutesToday)}
                      {user.dailyLimitMinutes > 0 && (
                        <span className="font-normal text-gray-400">
                          {' '}
                          / {formatMinutes(user.dailyLimitMinutes)}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-gray-500">
                      {liveResourceCount} live
                      {peakResourceCount > 0 ? ` · peak ${peakResourceCount}` : ''}
                      {' · '}
                      {isSharedCosting ? (
                        <span>${liveCost.toFixed(2)} MTD</span>
                      ) : (
                        <span>${liveCost.toFixed(2)} live</span>
                      )}
                    </p>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 pb-4 pt-3 sm:px-6">
                    {(user.blockedForToday || user.dailyLimitReached) && user.blockedReasonLabel && (
                      <span
                        className={`mb-3 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          user.dailyLimitReached
                            ? 'bg-red-100 text-red-600'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {user.blockedReasonLabel}
                      </span>
                    )}

                    {(showUsageTracking ? dailyUsage[user.id] : null) && (
                      <div className="mb-4 max-w-md">
                        <DailyUsageBar usage={dailyUsage[user.id]!} />
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-lg border border-gray-100 bg-white p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Time spent
                        </p>
                        <div className="mt-1.5 text-sm text-gray-700">
                          <TimeSpentCell user={user} />
                        </div>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-white p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Resources
                        </p>
                        <div className="mt-1.5 text-sm text-gray-700">
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
                        </div>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-white p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Session
                        </p>
                        <div className="mt-1.5 text-sm text-gray-700">
                          <SessionCell user={user} />
                        </div>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-white p-3 sm:col-span-2 lg:col-span-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Cost
                        </p>
                        <div className="mt-1.5">
                          <UserCostCell
                            user={user}
                            costingMode={isSharedCosting ? 'shared' : 'per_user'}
                            azureCost={azureCost}
                            loadingAzureCost={loadingAzureCost}
                            expanded={expandedCostUserId === user.id}
                            onToggleExpand={(event) => {
                              event.stopPropagation();
                              setExpandedCostUserId((current) =>
                                current === user.id ? null : user.id
                              );
                            }}
                            onRefreshAzure={
                              isSharedCosting
                                ? undefined
                                : (event) => void handleFetchAzureCost(event, user)
                            }
                          />
                        </div>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-white p-3 sm:col-span-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Roles
                        </p>
                        <div className="mt-1.5">
                          <RoleBadges roles={user.roles} />
                          <RoleSelect
                            user={user}
                            availableRoles={availableRoles}
                            disabled={roleChanging || saving}
                            onChange={(roleName) => void handleRoleChange(user.id, roleName)}
                          />
                        </div>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-white p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Quick stats
                        </p>
                        <p className="mt-1.5 text-sm text-gray-700">
                          {formatMinutes(usedTodayMinutes)} used today
                        </p>
                        <p className="text-xs text-gray-500">
                          {liveResourceCount} live resource{liveResourceCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {user.hasActiveSession && (
                        <button
                          type="button"
                          onClick={(event) => void handleForceLogout(event, user)}
                          disabled={saving || loggingOut}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          {loggingOut ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <LogOut className="h-3.5 w-3.5" />
                          )}
                          Force logout
                        </button>
                      )}
                      {isBlocked && onUnblock && (
                        <button
                          type="button"
                          onClick={(event) => void handleUnblock(event, user)}
                          disabled={saving || unblocking}
                          className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-800 transition hover:bg-green-100 disabled:opacity-50"
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
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          {cleaningUp ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Run cleanup
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
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-[#B91C1C]/30 hover:bg-red-50 hover:text-[#B91C1C]"
                      >
                        <Activity className="h-3.5 w-3.5" />
                        {sessionsExpanded ? 'Hide sessions' : 'Session history'}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setUsageUser(user);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        Usage details
                      </button>
                      {onDeleteUser && (
                        <button
                          type="button"
                          onClick={(event) => void handleDeleteUser(event, user)}
                          disabled={saving || deletingUser}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingUser ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserX className="h-3.5 w-3.5" />
                          )}
                          Delete user
                        </button>
                      )}
                    </div>

                    {sessionsExpanded && requestId != null && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-gray-100 bg-white">
                        <SessionHistoryPanel
                          requestId={requestId}
                          user={user}
                          onClose={() => setExpandedSessionsUserId(null)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filteredUsers.length > 0 && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage <= 1}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <span className="text-sm text-gray-600">
            Page {safePage} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage >= totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {listContent}

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
