'use client';



import { useEffect, useState } from 'react';

import { Activity, DollarSign, Loader2, LogOut, Users } from 'lucide-react';

import { getOrgDailyUsage } from '../../api/orgAdminClient';

import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';

import { RequestStatusBadge } from '../RequestStatusBadge';

import { formatCurrency, formatDateTime, formatMinutes } from '../../utils/formatters';

import type {
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

  sessionToken: string | null;

  loading: boolean;

  selectedUserId: number | null;

  saving: boolean;

  onSelect: (userId: number) => void;

  onForceLogout: (userId: number) => Promise<boolean>;

  fetchUserMonitoring: (userId: number) => Promise<import('../../types/orgAdmin').OrgAdminMonitoringResponse | null>;

  onFetchAzureCost: (userId: number) => Promise<OrgAdminUserAzureCost | null>;

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



function RoleChips({ roles }: { roles: OrgAdminUser['roles'] }) {

  if (roles.length === 0) {

    return <span className="text-xs text-gray-400">No roles</span>;

  }



  return (

    <div className="flex flex-wrap gap-1">

      {roles.slice(0, 3).map((entry) => (

        <span

          key={`${entry.role}-${entry.scope ?? 'default'}`}

          className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700"

        >

          {entry.role}

        </span>

      ))}

      {roles.length > 3 && (

        <span className="text-xs text-gray-400">+{roles.length - 3}</span>

      )}

    </div>

  );

}



function TimeSpentCell({ user }: { user: OrgAdminUser }) {

  const total = user.totalMinutesSpent ?? 0;



  if (total <= 0 && !user.hasActiveSession) {

    return <span className="text-gray-400">No sessions</span>;

  }



  return (

    <div>

      <span className="font-medium text-gray-900">{formatMinutes(total)}</span>

      {user.hasActiveSession && (user.activeSessionMinutes ?? 0) > 0 && (

        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-green-700">

          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />

          Live +{formatMinutes(user.activeSessionMinutes)}

        </p>

      )}

    </div>

  );

}



export function OrgAdminUsersTable({

  users,

  request,

  requestId,

  sessionToken,

  loading,

  selectedUserId,

  saving,

  onSelect,

  onForceLogout,

  fetchUserMonitoring,

  onFetchAzureCost,

}: OrgAdminUsersTableProps) {

  const [usageUser, setUsageUser] = useState<OrgAdminUser | null>(null);

  const [loggingOutUserId, setLoggingOutUserId] = useState<number | null>(null);

  const [azureCosts, setAzureCosts] = useState<Record<number, OrgAdminUserAzureCost>>({});

  const [loadingAzureCostUserId, setLoadingAzureCostUserId] = useState<number | null>(null);

  const [dailyUsage, setDailyUsage] = useState<Record<number, OrgAdminDailyUsageEntry>>({});



  useEffect(() => {

    if (!requestId || !sessionToken) return undefined;



    const fetchDailyUsage = async () => {

      try {

        const response = await getOrgDailyUsage(sessionToken, requestId);

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

  }, [requestId, sessionToken]);



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



  if (loading) {

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

    return (

      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">

        <Users className="mb-4 h-10 w-10 text-gray-300" />

        <h3 className="text-base font-semibold text-gray-900">No users</h3>

        <p className="mt-1 text-sm text-gray-500">Provisioned users will appear here.</p>

      </div>

    );

  }



  const isPerUser = request?.costingMode === 'per_user';



  return (

    <>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

        <div className="border-b border-gray-100 px-6 py-4">

          <h2 className="text-sm font-semibold text-gray-900">Provisioned Users</h2>

          <p className="mt-0.5 text-xs text-gray-500">

            Live retail-based estimates update automatically. Use Azure cost to pull actual billed

            spend from Azure (typically delayed by several hours).

          </p>

        </div>



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

                const azureCost = azureCosts[user.id];

                const loadingAzureCost = loadingAzureCostUserId === user.id;



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

                      <RequestStatusBadge status={user.status} />

                    </td>



                    <td className="px-4 py-3 text-gray-700">

                      <span className="font-medium">{user.resourceCount ?? 0}</span>

                      <span className="text-gray-400"> provisioned</span>

                    </td>



                    <td className="px-4 py-3 text-gray-700">

                      <TimeSpentCell user={user} />

                    </td>



                    <td className="px-4 py-3">

                      <span className="font-medium text-gray-900">

                        {formatCurrency(user.liveCost ?? 0)}

                      </span>

                      {(user.hourlyResourceRate ?? 0) > 0 && (

                        <p className="text-xs text-gray-500">

                          {formatCurrency(user.hourlyResourceRate)}/hr

                        </p>

                      )}

                    </td>



                    <td className="px-4 py-3">

                      {azureCost ? (

                        <div>

                          <span className="font-medium text-violet-900">

                            {formatCurrency(azureCost.monthToDateCost)} MTD

                          </span>

                          <p className="text-xs text-gray-500">

                            {formatCurrency(azureCost.lifetimeCost)} lifetime

                          </p>

                          {azureCost.attributionMethod === 'proportional' && azureCost.sharePercent != null && (

                            <p className="text-xs text-amber-700">

                              {azureCost.sharePercent}% of shared RG

                            </p>

                          )}

                        </div>

                      ) : (

                        <span className="text-xs text-gray-400">Not fetched</span>

                      )}

                    </td>



                    <td className="px-4 py-3">

                      {user.hasActiveSession ? (

                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">

                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />

                          Active

                        </span>

                      ) : (

                        <span className="text-xs text-gray-500">

                          {formatDateTime(user.lastLoginAt)}

                        </span>

                      )}

                    </td>



                    <td className="px-4 py-3">

                      <RoleChips roles={user.roles} />

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

