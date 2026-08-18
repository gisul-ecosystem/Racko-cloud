'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  DollarSign,
  ExternalLink,
  Loader2,
  LogOut,
  Shield,
  ShieldOff,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  formatCurrency,
  formatMinutes,
  getGcpOrgDailyUsage,
} from '../../api/orgAdminClient';
import type {
  GcpIamPolicyGroup,
  GcpOrgAdminDailyUsageEntry,
  GcpOrgAdminMonitoringResponse,
  GcpOrgAdminRequestDetail,
  GcpOrgAdminUser,
  GcpOrgAdminUserCost,
} from '../../types/orgAdmin';
import { GcpLabStatusBadge } from './GcpLabStatusBadge';
import { GcpOrgAdminCostModal } from './GcpOrgAdminCostModal';
import { GcpOrgAdminUserUsageModal } from './GcpOrgAdminUserUsageModal';
import { GcpOrgAdminAddUsersModal } from './GcpOrgAdminAddUsersModal';

interface GcpOrgAdminUsersTableProps {
  detail: GcpOrgAdminRequestDetail;
  iamPolicies: GcpIamPolicyGroup[];
  saving: boolean;
  onSuspend: (userIndex: number) => Promise<boolean>;
  onReinstate: (userIndex: number) => Promise<boolean>;
  onUnblock: (userIndex: number) => Promise<boolean>;
  onDelete: (userIndex: number) => Promise<boolean>;
  onConsoleUrl: (userIndex: number) => Promise<boolean>;
  onUpdatePermissions: (userIndex: number, policies: string[]) => Promise<boolean>;
  onFetchCost: (userIndex: number) => Promise<GcpOrgAdminUserCost | null>;
  onForceLogout: (userIndex: number) => Promise<boolean>;
  onCleanup: (userIndex: number) => Promise<boolean>;
  onAddUser?: (count: number) => Promise<boolean>;
  onBlockAll?: () => Promise<boolean>;
  onUnblockAll?: () => Promise<boolean>;
  onRequestCleanup?: () => Promise<boolean>;
  fetchUserMonitoring: (userIndex: number) => Promise<GcpOrgAdminMonitoringResponse | null>;
}

function DailyUsageBar({ usage }: { usage: GcpOrgAdminDailyUsageEntry }) {
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

function TimeSpentCell({ user }: { user: GcpOrgAdminUser }) {
  const todayMinutes = user.todayMinutes ?? user.usedTodayMinutes ?? 0;
  const lifetimeMinutes = user.totalMinutesSpent ?? 0;

  if (todayMinutes <= 0 && lifetimeMinutes <= 0 && !user.hasActiveSession) {
    return <span className="text-gray-400">0m</span>;
  }

  return (
    <div>
      <p className="font-medium text-gray-900">
        {user.todayFormatted ?? formatMinutes(todayMinutes)}
      </p>
      <p className="text-[11px] text-gray-400">today</p>
      {lifetimeMinutes > 0 && lifetimeMinutes !== todayMinutes && (
        <p className="mt-0.5 text-[11px] text-gray-500">
          {user.lifetimeFormatted ?? formatMinutes(lifetimeMinutes)} total
        </p>
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

export function GcpOrgAdminUsersTable({
  detail,
  iamPolicies,
  saving,
  onSuspend,
  onReinstate,
  onUnblock,
  onDelete,
  onConsoleUrl,
  onUpdatePermissions,
  onFetchCost,
  onForceLogout,
  onCleanup,
  onAddUser,
  onBlockAll,
  onUnblockAll,
  onRequestCleanup,
  fetchUserMonitoring,
}: GcpOrgAdminUsersTableProps) {
  const [editingUserIndex, setEditingUserIndex] = useState<number | null>(null);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [busyUserIndex, setBusyUserIndex] = useState<number | null>(null);
  const [costUserIndex, setCostUserIndex] = useState<number | null>(null);
  const [costData, setCostData] = useState<GcpOrgAdminUserCost | null>(null);
  const [loadingCost, setLoadingCost] = useState(false);
  const [usageUser, setUsageUser] = useState<GcpOrgAdminUser | null>(null);
  const [loggingOutUserIndex, setLoggingOutUserIndex] = useState<number | null>(null);
  const [dailyUsage, setDailyUsage] = useState<Record<number, GcpOrgAdminDailyUsageEntry>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [expandedUserIndex, setExpandedUserIndex] = useState<number | null>(null);
  const [showAddUsersModal, setShowAddUsersModal] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [blockingAll, setBlockingAll] = useState(false);
  const [unblockingAll, setUnblockingAll] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const pageSize = 10;

  const showUsageTracking = Boolean(detail.enableDailyUsage || detail.usageWindows?.length);
  const totalLiveResources = useMemo(
    () => detail.users.reduce((sum, user) => sum + Number(user.lastResourceCount || 0), 0),
    [detail.users]
  );
  const cleanupIsPause = detail.resourceCleanupAction === 'pause';
  const toolbarBusy = saving || addingUser || blockingAll || unblockingAll || cleanupRunning;
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return detail.users.filter((user) => {
      const status = user.suspended ? 'suspended' : user.status.toLowerCase();
      return (
        (statusFilter === 'all' || status.includes(statusFilter)) &&
        (!query ||
          user.username.toLowerCase().includes(query) ||
          (user.email || '').toLowerCase().includes(query) ||
          (user.roleName || '').toLowerCase().includes(query) ||
          (user.accountId || '').includes(query))
      );
    });
  }, [detail.users, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pageUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (!detail.requestId || !showUsageTracking) return undefined;

    const fetchDailyUsage = async () => {
      try {
        const response = await getGcpOrgDailyUsage(detail.requestId);
        if (response.success && response.data) {
          const map: Record<number, GcpOrgAdminDailyUsageEntry> = {};
          response.data.forEach((entry) => {
            map[entry.userIndex] = entry;
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
  }, [detail.requestId, showUsageTracking]);

  async function handleDelete(userIndex: number) {
    if (!confirm(`Delete labuser${userIndex + 1}? This removes their IAM role permanently.`)) {
      return;
    }
    setBusyUserIndex(userIndex);
    try {
      await onDelete(userIndex);
    } finally {
      setBusyUserIndex(null);
    }
  }

  async function handleSavePermissions(userIndex: number) {
    setBusyUserIndex(userIndex);
    try {
      const ok = await onUpdatePermissions(userIndex, selectedPolicies);
      if (ok) setEditingUserIndex(null);
    } finally {
      setBusyUserIndex(null);
    }
  }

  async function handleFetchCost(userIndex: number) {
    setLoadingCost(true);
    setCostUserIndex(userIndex);
    try {
      const cost = await onFetchCost(userIndex);
      setCostData(cost);
    } finally {
      setLoadingCost(false);
    }
  }

  async function handleForceLogout(userIndex: number) {
    if (!confirm(`Force logout labuser${userIndex + 1}?`)) return;

    setLoggingOutUserIndex(userIndex);
    try {
      await onForceLogout(userIndex);
    } finally {
      setLoggingOutUserIndex(null);
    }
  }

  if (!detail.users?.length) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {onAddUser ? (
            <button
              type="button"
              onClick={() => setShowAddUsersModal(true)}
              disabled={toolbarBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add user (0/{detail.accountCount || 0})
            </button>
          ) : null}
        </div>
        <div className="py-10 text-center text-sm text-gray-500">No provisioned users yet.</div>
        {showAddUsersModal && onAddUser ? (
          <GcpOrgAdminAddUsersModal
            usersCount={0}
            request={detail}
            submitting={addingUser}
            onClose={() => setShowAddUsersModal(false)}
            onSubmit={async (count) => {
              setAddingUser(true);
              try {
                const success = await onAddUser(count);
                if (success) setShowAddUsersModal(false);
              } finally {
                setAddingUser(false);
              }
            }}
          />
        ) : null}
      </div>
    );
  }

  async function handleAddUsersSubmit(count: number) {
    if (!onAddUser) return;
    setAddingUser(true);
    try {
      const success = await onAddUser(count);
      if (success) setShowAddUsersModal(false);
    } finally {
      setAddingUser(false);
    }
  }

  async function handleCleanupAllLive() {
    if (!onRequestCleanup) return;
    const liveNote =
      totalLiveResources > 0 ? `\n\nApprox. ${totalLiveResources} tracked live resource(s).` : '';
    if (
      !window.confirm(
        `${cleanupIsPause ? 'Pause' : 'Delete'} all Gcp lab resources for every user in this request?${liveNote}\n\nIAM users/roles are kept so users can recreate resources afterward.`
      )
    ) {
      return;
    }
    setCleanupRunning(true);
    try {
      await onRequestCleanup();
    } finally {
      setCleanupRunning(false);
    }
  }

  async function handleBlockAll() {
    if (!onBlockAll) return;
    if (
      !window.confirm(
        `Block all ${detail.users.length} user(s) immediately?\n\nThis suspends every lab identity and revokes active Gcp console sessions.`
      )
    ) {
      return;
    }
    setBlockingAll(true);
    try {
      await onBlockAll();
    } finally {
      setBlockingAll(false);
    }
  }

  async function handleUnblockAll() {
    if (!onUnblockAll) return;
    if (
      !window.confirm(
        `Unblock all ${detail.users.length} user(s) immediately?\n\nThis reinstates Gcp access and pauses usage-window enforcement for 24 hours. Passwords are refreshed for Direct IAM users.`
      )
    ) {
      return;
    }
    setUnblockingAll(true);
    try {
      await onUnblockAll();
    } finally {
      setUnblockingAll(false);
    }
  }

  return (
    <>
      <p className="mb-4 text-xs text-gray-500">
        Manage IAM lab users, permissions, and Gcp console access.
        {showUsageTracking
          ? ' Session and daily usage data refresh every minute when this panel is open.'
          : ' Spend data refreshes every minute when this panel is open.'}
      </p>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by username, role, or account ID"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            {detail.users.length} users total · showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, filteredUsers.length)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="suspended">Suspended</option>
            <option value="expired">Expired</option>
          </select>
          {onAddUser ? (
            <button
              type="button"
              onClick={() => setShowAddUsersModal(true)}
              disabled={toolbarBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addingUser ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              {addingUser
                ? 'Adding user…'
                : `Add user (${detail.users.length}/${detail.accountCount || detail.users.length})`}
            </button>
          ) : null}
          {onRequestCleanup ? (
            <button
              type="button"
              onClick={() => void handleCleanupAllLive()}
              disabled={toolbarBusy || detail.users.length === 0}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                cleanupIsPause
                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100'
              }`}
            >
              {cleanupRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {cleanupRunning
                ? 'Cleaning up…'
                : totalLiveResources > 0
                  ? `Cleanup live (${totalLiveResources})`
                  : 'Cleanup live resources'}
            </button>
          ) : null}
          {onBlockAll ? (
            <button
              type="button"
              onClick={() => void handleBlockAll()}
              disabled={toolbarBusy || detail.users.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {blockingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
              {blockingAll ? 'Blocking all…' : 'Block all'}
            </button>
          ) : null}
          {onUnblockAll ? (
            <button
              type="button"
              onClick={() => void handleUnblockAll()}
              disabled={toolbarBusy || detail.users.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {unblockingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              {unblockingAll ? 'Unblocking all…' : 'Unblock all'}
            </button>
          ) : null}
        </div>
      </div>

      {showAddUsersModal && onAddUser ? (
        <GcpOrgAdminAddUsersModal
          usersCount={detail.users.length}
          request={detail}
          submitting={addingUser}
          onClose={() => setShowAddUsersModal(false)}
          onSubmit={handleAddUsersSubmit}
        />
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              {[
                'Username',
                'IAM Role',
                'Status',
                ...(showUsageTracking ? ['Time spent', 'Session'] : ['Session']),
                'Access Type',
                'Spend Today',
                'Permissions',
                'Console',
                'Actions',
              ].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageUsers.map((user) => {
              const busy = saving && busyUserIndex === user.userIndex;
              const loggingOut = loggingOutUserIndex === user.userIndex;
              const budget = detail.perUserBudgetUsd || 0;
              const usage = dailyUsage[user.userIndex];

              return (
                <tr key={user.userIndex} className="border-b border-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{user.username}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedUserIndex((current) =>
                          current === user.userIndex ? null : user.userIndex
                        )
                      }
                      className="mt-1 text-[11px] font-medium text-blue-700 hover:underline"
                    >
                      {expandedUserIndex === user.userIndex ? 'Hide details' : 'Show details'}
                    </button>
                    {expandedUserIndex === user.userIndex && (
                      <div className="mt-2 space-y-0.5 rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600">
                        <p>Email: {user.email || '—'}</p>
                        <p>Account: {user.accountId || detail.gcpProjectId || '—'}</p>
                        <p>Role ARN: {user.roleArn || '—'}</p>
                        <p>Policies: {user.policies?.join(', ') || 'None'}</p>
                        <p>Last cleanup: {user.lastCleanupAt ? new Date(user.lastCleanupAt).toLocaleString() : 'Never'}</p>
                      </div>
                    )}
                    {user.budgetExceeded && (
                      <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
                        Budget exceeded
                      </span>
                    )}
                    {user.dailyLimitReached && (
                      <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
                        Daily limit reached
                      </span>
                    )}
                    {usage && <DailyUsageBar usage={usage} />}
                  </td>

                  <td className="px-4 py-3">
                    <p className="max-w-[180px] truncate font-mono text-xs text-violet-800">
                      {user.roleName || '—'}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <GcpLabStatusBadge status={user.status} />
                  </td>

                  {showUsageTracking && (
                    <>
                      <td className="px-4 py-3">
                        <TimeSpentCell user={user} />
                      </td>
                      <td className="px-4 py-3">
                        {user.activeSession || user.hasActiveSession ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                              Active
                            </span>
                            {user.activeSession?.expiresAt && (
                              <p className="mt-1 text-[11px] text-gray-500">
                                Expires {new Date(user.activeSession.expiresAt).toLocaleTimeString()}
                              </p>
                            )}
                            {user.sessionStartedAt && !user.activeSession?.expiresAt && (
                              <p className="mt-1 text-[11px] text-gray-500">
                                Since {new Date(user.sessionStartedAt).toLocaleTimeString()}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="text-xs text-gray-400">Offline</span>
                            {user.lastSessionAt && (
                              <p className="mt-1 text-[11px] text-gray-500">
                                Last {new Date(user.lastSessionAt).toLocaleString()}
                              </p>
                            )}
                            {user.lastLoginAt && !user.lastSessionAt && (
                              <p className="mt-1 text-[11px] text-gray-500">
                                Last {new Date(user.lastLoginAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        )}
                        <p className="mt-1 text-[11px] text-gray-500">
                          {user.totalSessions || 0} sessions
                        </p>
                      </td>
                    </>
                  )}

                  {!showUsageTracking && (
                    <td className="px-4 py-3">
                      {user.activeSession || user.hasActiveSession ? (
                        <div>
                          <span className="text-xs font-semibold text-green-700">● Active</span>
                          {user.activeSession?.expiresAt && (
                            <p className="mt-1 text-[11px] text-gray-500">
                              Expires {new Date(user.activeSession.expiresAt).toLocaleTimeString()}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">○ Offline</span>
                      )}
                      <p className="mt-1 text-[11px] text-gray-500">
                        {user.totalSessions || 0} sessions
                      </p>
                    </td>
                  )}

                  <td className="px-4 py-3">
                    {detail.accessType === 'cloud_identity' ? (
                      <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                        🔐 Direct IAM
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                        🔗 Magic Link
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">
                      {formatCurrency(user.currentSpend || 0)}
                    </span>
                    {budget > 0 && (
                      <p className="text-xs text-gray-500">of {formatCurrency(budget)}</p>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {editingUserIndex === user.userIndex ? (
                      <div className="max-w-xs">
                        <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
                          {(detail.selectedServices || []).flatMap((serviceName) => {
                            const group = iamPolicies.find((entry) => entry.service === serviceName);
                            return (group?.policies || []).map((policy) => (
                              <label
                                key={`${serviceName}-${policy}`}
                                className="mb-1 flex items-center gap-2 text-xs text-gray-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPolicies.includes(policy)}
                                  onChange={(event) => {
                                    setSelectedPolicies((current) =>
                                      event.target.checked
                                        ? [...current, policy]
                                        : current.filter((entry) => entry !== policy)
                                    );
                                  }}
                                />
                                {policy}
                              </label>
                            ));
                          })}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleSavePermissions(user.userIndex)}
                            className="rounded-lg bg-[#B91C1C] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingUserIndex(null)}
                            className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUserIndex(user.userIndex);
                          setSelectedPolicies(user.policies || []);
                        }}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-[#B91C1C]/30 hover:text-[#B91C1C]"
                      >
                        Edit Permissions
                      </button>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={user.suspended || user.dailyLimitReached || busy}
                      onClick={() => void onConsoleUrl(user.userIndex)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Console
                    </button>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {showUsageTracking && (
                        <>
                          <button
                            type="button"
                            onClick={() => setUsageUser(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800"
                          >
                            <Activity className="h-3.5 w-3.5" />
                            Usage
                          </button>
                          {user.hasActiveSession && (
                            <button
                              type="button"
                              disabled={loggingOut || busy}
                              onClick={() => void handleForceLogout(user.userIndex)}
                              className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-800 disabled:opacity-50"
                            >
                              {loggingOut ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <LogOut className="h-3.5 w-3.5" />
                              )}
                              End session
                            </button>
                          )}
                        </>
                      )}
                      {user.dailyLimitReached && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onUnblock(user.userIndex)}
                          className="rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-800 disabled:opacity-50"
                        >
                          Unblock
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          window.confirm(`Clean Gcp resources for ${user.username}?`) &&
                          void onCleanup(user.userIndex)
                        }
                        className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
                      >
                        Clean now
                      </button>
                      {user.suspended ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onReinstate(user.userIndex)}
                          className="rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-800 disabled:opacity-50"
                        >
                          Reinstate
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onSuspend(user.userIndex)}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={loadingCost && costUserIndex === user.userIndex}
                        onClick={() => void handleFetchCost(user.userIndex)}
                        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 disabled:opacity-50"
                      >
                        {loadingCost && costUserIndex === user.userIndex ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <DollarSign className="h-3.5 w-3.5" />
                        )}
                        Cost
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDelete(user.userIndex)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span className="text-gray-500">Page {page} of {pageCount}</span>
          <button type="button" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      )}

      {costData && costUserIndex != null && (
        <GcpOrgAdminCostModal
          userIndex={costUserIndex}
          cost={costData}
          onClose={() => {
            setCostData(null);
            setCostUserIndex(null);
          }}
        />
      )}

      {usageUser && (
        <GcpOrgAdminUserUsageModal
          user={usageUser}
          request={detail}
          fetchMonitoring={() => fetchUserMonitoring(usageUser.userIndex)}
          onClose={() => setUsageUser(null)}
        />
      )}
    </>
  );
}
