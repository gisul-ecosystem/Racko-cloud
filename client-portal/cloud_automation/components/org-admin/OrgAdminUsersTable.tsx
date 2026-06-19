'use client';

import { useEffect, useState } from 'react';

import { Activity, DollarSign, Loader2, LogOut, Users } from 'lucide-react';

import { getOrgDailyUsage } from '../../api/orgAdminClient';

import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';

import { RequestStatusBadge } from '../RequestStatusBadge';

import { formatCurrency, formatDateTime, formatMinutes } from '../../utils/formatters';

import type {
  OrgAdminAzureRoleOption,
  OrgAdminDailyUsageEntry,
  OrgAdminRequestDetail,
  OrgAdminUser,
  OrgAdminUserAzureCost,
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
  onSelect: (userId: number) => void;
  onForceLogout: (userId: number) => Promise<boolean>;
  onUpdateRoles: (userId: number, roles: string[]) => Promise<boolean>;
  fetchUserMonitoring: (userId: number) => Promise<import('../../types/orgAdmin').OrgAdminMonitoringResponse | null>;
  onFetchAzureCost: (userId: number) => Promise<OrgAdminUserAzureCost | null>;
  embedded?: boolean;
}

function DailyUsageBar({ usage }: { usage: OrgAdminDailyUsageEntry }) {
  if (usage.dailyLimitHours === null) {
    return null;
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
          <span className="font-medium text-red-600">Limit reached — blocked</span>
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
  const todayMinutes = user.todayMinutes ?? user.usedTodayMinutes ?? 0;
  const lifetimeMinutes = user.lifetimeMinutes ?? user.totalMinutesSpent ?? 0;
  const todayLabel = user.todayFormatted ?? formatMinutes(todayMinutes);
  const lifetimeLabel = user.lifetimeFormatted ?? formatMinutes(lifetimeMinutes);

  if (todayMinutes <= 0 && lifetimeMinutes <= 0 && !user.hasActiveSession) {
    return <span className="text-gray-400">0m</span>;
  }

  return (
    <div>
      <p className="font-medium text-gray-900">{todayLabel}</p>
      <p className="text-[11px] text-gray-400">today</p>
      {lifetimeMinutes > 0 && lifetimeMinutes !== todayMinutes && (
        <p className="mt-0.5 text-[11px] text-gray-500">{lifetimeLabel} total</p>
      )}
      {user.hasActiveSession && (user.activeSessionMinutes ?? 0) > 0 && (
        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-green-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          Live +{formatMinutes(user.activeSessionMinutes)}
        </p>
      )}
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
    <div>
      <select
        className="max-w-[180px] rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 shadow-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
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
      {disabled && <p className="mt-1 text-[11px] text-gray-500">Updating in Azure...</p>}
    </div>
  );
}

export function OrgAdminUsersTable({
  users,
  request,
  requestId,
  availableRoles,
  loading,
  selectedUserId,
  saving,
  onSelect,
  onForceLogout,
  onUpdateRoles,
  fetchUserMonitoring,
  onFetchAzureCost,
  embedded = false,
}: OrgAdminUsersTableProps) {
  const [usageUser, setUsageUser] = useState<OrgAdminUser | null>(null);
  const [loggingOutUserId, setLoggingOutUserId] = useState<number | null>(null);
  const [roleChangingUserId, setRoleChangingUserId] = useState<number | null>(null);
  const [azureCosts, setAzureCosts] = useState<Record<number, OrgAdminUserAzureCost>>({});
  const [loadingAzureCostUserId, setLoadingAzureCostUserId] = useState<number | null>(null);
  const [dailyUsage, setDailyUsage] = useState<Record<number, OrgAdminDailyUsageEntry>>({});

  useEffect(() => {
    if (!requestId) return undefined;

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
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [requestId]);

  async function handleFetchAzureCost(event: React.MouseEvent, user: OrgAdminUser) {
    event.stopPropagation();
    setLoadingAzureCostUserId(user.id);

    try {
      const cost = await onFetchAzureCost(user.id);
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

  const tableContent = (
    <div className={embedded ? '' : 'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm'}>
      {!embedded && (
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Provisioned Users</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Session and time data refresh every minute. Azure cost shows cached spend from the hourly
            budget sync; use Azure cost for live billing detail.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
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
                const roleChanging = roleChangingUserId === user.id;
                const azureCost = azureCosts[user.id];
                const loadingAzureCost = loadingAzureCostUserId === user.id;
                const displayStatus = user.displayStatus ?? user.status;
                const liveResourceCount = user.liveResourceCount ?? user.resourceCount ?? 0;
                const azureCostMtd = user.azureCostMtd ?? 0;
                const azureCostLifetime = user.azureCostLifetime ?? azureCostMtd;
                const liveCost = user.liveCost ?? 0;
                const hourlyRate = user.hourlyResourceRate ?? 0;

                return (
                  <tr
                    key={user.id}
                    onClick={() => onSelect(user.id)}
                    className={`cursor-pointer border-b border-gray-50 transition hover:bg-gray-50 ${
                      selected ? 'bg-red-50/60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{user.username}</p>
                      <p className="font-mono text-xs text-gray-500">{user.azureUserId || '—'}</p>
                      {dailyUsage[user.id] && <DailyUsageBar usage={dailyUsage[user.id]!} />}
                      {dailyUsage[user.id]?.limitReached && (
                        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
                          Blocked today
                        </span>
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
                      <p className="font-medium">{liveResourceCount}</p>
                      <p className="text-[11px] text-gray-400">live in Azure</p>
                    </td>

                    <td className="px-4 py-3 text-gray-700">
                      <TimeSpentCell user={user} />
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{formatCurrency(liveCost)}</span>
                      {hourlyRate > 0 ? (
                        <p className="text-xs text-gray-500">{formatCurrency(hourlyRate)}/hr</p>
                      ) : (
                        <p className="text-xs text-gray-400">No rate configured</p>
                      )}
                      {(user.lifetimeMinutes ?? user.totalMinutesSpent ?? 0) > 0 && (
                        <p className="text-[11px] text-gray-400">
                          {user.lifetimeFormatted ?? formatMinutes(user.lifetimeMinutes ?? 0)} session
                          time
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div>
                        <span
                          className={`font-medium ${
                            user.budgetExceeded ? 'text-red-600' : 'text-violet-900'
                          }`}
                        >
                          {formatCurrency(azureCostMtd)} MTD
                        </span>
                        <p className="text-xs text-gray-500">
                          {formatCurrency(azureCostLifetime)} lifetime
                        </p>
                        {user.totalBudget != null && user.totalBudget > 0 && (
                          <p className="text-[11px] text-gray-400">
                            / {formatCurrency(user.totalBudget)} budget
                          </p>
                        )}
                        {user.lastCostSyncedAt && (
                          <p className="text-[10px] text-gray-300">
                            synced {formatDateTime(user.lastCostSyncedAt)}
                          </p>
                        )}
                        {user.budgetExceeded && (
                          <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                            Exceeded
                          </span>
                        )}
                        {azureCost && (
                          <p className="mt-1 text-[10px] text-amber-700">
                            Live fetch: {formatCurrency(azureCost.monthToDateCost)} MTD
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {user.hasActiveSession ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                            Active
                          </span>
                          {user.sessionStartedAt && (
                            <p className="mt-0.5 text-[11px] text-gray-400">
                              since {formatDateTime(user.sessionStartedAt)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            Offline
                          </span>
                          {user.lastLoginAt && (
                            <p className="mt-0.5 text-[11px] text-gray-400">
                              Last {formatDateTime(user.lastLoginAt)}
                            </p>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <RoleSelect
                        user={user}
                        availableRoles={availableRoles}
                        disabled={roleChanging || saving}
                        onChange={(roleName) => void handleRoleChange(user.id, roleName)}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setUsageUser(user);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:border-[#B91C1C]/30 hover:bg-red-50 hover:text-[#B91C1C]"
                          title="View live usage details and session history"
                        >
                          <Activity className="h-3.5 w-3.5" />
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={(event) => void handleFetchAzureCost(event, user)}
                          disabled={loadingAzureCost || saving}
                          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 transition hover:bg-violet-100 disabled:opacity-50"
                          title="Fetch actual billed cost from Azure Cost Management"
                        >
                          {loadingAzureCost ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <DollarSign className="h-3.5 w-3.5" />
                          )}
                          Azure cost
                        </button>
                        {user.hasActiveSession && (
                          <button
                            type="button"
                            onClick={(event) => void handleForceLogout(event, user)}
                            disabled={saving || loggingOut}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                          >
                            {loggingOut ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <LogOut className="h-3.5 w-3.5" />
                            )}
                            Logout
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
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
