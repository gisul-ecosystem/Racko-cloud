'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import {
  tenantAccentButton,
  tenantAccentText,
  tenantAccentToggleActive,
} from '@/lib/tenantAccentStyles';
import { fetchTenantUsers } from '@/lib/tenantVmApi';
import {
  fetchAvailableTenantExternalVMs,
  bulkAssignTenantExternalOneToOne,
  type IExternalVM,
  type BulkAssignExternalPairsResult,
} from '@/lib/tenantExternalVmApi';
import { WeeklyAccessHoursEditor } from '@/components/access-schedule/WeeklyAccessHoursEditor';
import { ApiError } from '@/lib/apiClient';
import {
  buildWeeklyAccessSchedule,
  createDefaultWeeklyEditorValue,
  type WeeklyAccessEditorValue,
} from '@/lib/accessSchedule';
import type { TenantUserProfile } from '@/types/tenantPortal';
import { ChevronLeft, Server, Loader2, Download, AlertCircle } from 'lucide-react';

type UserMode = 'create' | 'existing';
type PasswordMode = 'auto' | 'shared';

/** Must match core-api bulkAssignExternalPairsSchema / assignExternalVMsSchema max. */
const BULK_ASSIGN_MAX = 250;

export default function TenantElasticBulkAssignPage() {
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();

  const [users, setUsers] = useState<TenantUserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [servers, setServers] = useState<IExternalVM[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkAssignExternalPairsResult | null>(null);

  const [userMode, setUserMode] = useState<UserMode>('create');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('auto');
  const [sharedPassword, setSharedPassword] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleValue, setScheduleValue] = useState<WeeklyAccessEditorValue>(() =>
    createDefaultWeeklyEditorValue()
  );

  const loadServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const available = await fetchAvailableTenantExternalVMs();
      setServers(available);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load servers.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const usersResult = await fetchTenantUsers();
      setUsers(usersResult.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_admin') {
      void loadServers();
      void loadUsers();
    }
  }, [loadServers, loadUsers, tenantUser?.role]);

  const selectedList = useMemo(
    () => [...selectedIds].map((id) => servers.find((s) => s._id === id)).filter((s): s is IExternalVM => !!s),
    [servers, selectedIds]
  );

  const selectedUsers = useMemo(
    () => [...selectedUserIds].map((id) => users.find((u) => u.id === id)).filter(Boolean),
    [users, selectedUserIds]
  );

  const count = selectedIds.size;
  const countsMatch = userMode === 'create' ? count > 0 : count > 0 && count === selectedUserIds.size;

  const canSubmit =
    countsMatch &&
    (userMode === 'existing' ||
      (emailPrefix.includes('@') && (passwordMode === 'auto' || sharedPassword.length > 0)));

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const externalVmIds = selectedList.map((s) => s._id);
      const accessSchedule = scheduleEnabled
        ? buildWeeklyAccessSchedule(scheduleValue)
        : undefined;
      const res = await bulkAssignTenantExternalOneToOne(
        userMode === 'create'
          ? {
              externalVmIds,
              mode: 'create',
              emailPrefix: emailPrefix.toLowerCase().trim(),
              passwordMode,
              ...(passwordMode === 'shared' ? { sharedPassword } : {}),
              ...(accessSchedule ? { accessSchedule } : {}),
            }
          : {
              externalVmIds,
              mode: 'existing',
              userIds: selectedUsers.map((u) => u!.id),
              ...(accessSchedule ? { accessSchedule } : {}),
            }
      );
      setResult(res);
      setSelectedIds(new Set());
      setSelectedUserIds(new Set());
      await Promise.all([loadServers(), loadUsers()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bulk assign failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function downloadCSV() {
    if (!result) return;
    const rows = [
      ['Server', 'Email', 'Password', 'Status'],
      ...result.pairs.map((p) => [p.externalVmName, p.userEmail, p.password ?? '', p.status]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenant-esi-bulk-assign-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (tenantUser?.role !== 'tenant_admin') return null;

  return (
    <div className="max-w-4xl">
      <Link href={tenantConsole.elasticAssign} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ChevronLeft className="w-4 h-4" /> Back to Assign Servers
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Assign (1:1)</h1>
        <p className="text-gray-500 text-sm mt-0.5">Assign one imported server per user</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {result && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <span className="text-sm text-green-700 bg-green-50 px-3 py-1 rounded-lg">{result.assigned} assigned</span>
              {result.failed > 0 && (
                <span className="text-sm text-red-700 bg-red-50 px-3 py-1 rounded-lg">{result.failed} failed</span>
              )}
            </div>
            <button onClick={downloadCSV} className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm">
              <Download className="w-4 h-4" /> Download CSV
            </button>
          </div>
          <button type="button" onClick={() => setResult(null)} className="text-sm hover:underline" style={tenantAccentText(accentColor)}>
            Assign more
          </button>
        </div>
      )}

      {!result && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Select servers ({selectedIds.size} selected)
              </h2>
              {!loading && servers.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const capped =
                      servers.length > BULK_ASSIGN_MAX
                        ? selectedIds.size === BULK_ASSIGN_MAX &&
                          servers
                            .slice(0, BULK_ASSIGN_MAX)
                            .every((s) => selectedIds.has(s._id))
                        : selectedIds.size === servers.length;
                    if (capped) {
                      setSelectedIds(new Set());
                      return;
                    }
                    const ids = servers.slice(0, BULK_ASSIGN_MAX).map((s) => s._id);
                    setSelectedIds(new Set(ids));
                  }}
                  className="text-sm font-medium hover:underline"
                  style={tenantAccentText(accentColor)}
                >
                  {selectedIds.size === servers.length ||
                  (servers.length > BULK_ASSIGN_MAX && selectedIds.size === BULK_ASSIGN_MAX)
                    ? 'Deselect all'
                    : servers.length > BULK_ASSIGN_MAX
                      ? `Select all (max ${BULK_ASSIGN_MAX})`
                      : 'Select all'}
                </button>
              ) : null}
            </div>
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
            ) : servers.length === 0 ? (
              <p className="text-sm text-gray-500">No unassigned servers available.</p>
            ) : (
              <>
                {servers.length > BULK_ASSIGN_MAX ? (
                  <p className="mb-2 text-xs text-amber-700">
                    Bulk assign supports up to {BULK_ASSIGN_MAX} servers at a time. Select all
                    picks the first {BULK_ASSIGN_MAX}.
                  </p>
                ) : null}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {servers.map((s) => (
                    <label key={s._id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s._id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(s._id)) {
                              next.delete(s._id);
                            } else if (next.size < BULK_ASSIGN_MAX) {
                              next.add(s._id);
                            }
                            return next;
                          });
                        }}
                      />
                      <Server className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="text-xs text-gray-400 font-mono ml-auto">{s.ipAddress}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUserMode('create')}
                className={`flex-1 py-2 text-sm rounded-lg border ${userMode === 'create' ? 'font-medium' : 'border-gray-300'}`}
                style={userMode === 'create' ? tenantAccentToggleActive(accentColor) : undefined}
              >
                Create new users
              </button>
              <button
                type="button"
                onClick={() => setUserMode('existing')}
                className={`flex-1 py-2 text-sm rounded-lg border ${userMode === 'existing' ? 'font-medium' : 'border-gray-300'}`}
                style={userMode === 'existing' ? tenantAccentToggleActive(accentColor) : undefined}
              >
                Use existing users
              </button>
            </div>

            {userMode === 'create' ? (
              <>
                <input
                  type="email"
                  value={emailPrefix}
                  onChange={(e) => setEmailPrefix(e.target.value)}
                  placeholder="user@gmail.com → user1@gmail.com, user2@gmail.com…"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPasswordMode('auto')}
                    className={`flex-1 py-2 text-sm rounded-lg border ${passwordMode === 'auto' ? 'font-medium' : 'border-gray-300'}`}
                    style={passwordMode === 'auto' ? tenantAccentToggleActive(accentColor) : undefined}
                  >
                    Auto password
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordMode('shared')}
                    className={`flex-1 py-2 text-sm rounded-lg border ${passwordMode === 'shared' ? 'font-medium' : 'border-gray-300'}`}
                    style={passwordMode === 'shared' ? tenantAccentToggleActive(accentColor) : undefined}
                  >
                    Shared password
                  </button>
                </div>
                {passwordMode === 'shared' && (
                  <input type="password" value={sharedPassword} onChange={(e) => setSharedPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Shared password" />
                )}
              </>
            ) : (
              <div className="space-y-2">
                {usersLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
                ) : users.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No users yet.{' '}
                    <Link href={tenantConsole.elasticUsersCreate} className="hover:underline" style={tenantAccentText(accentColor)}>
                      Create users
                    </Link>{' '}
                    first or switch to create new users.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-gray-500">
                        {count > 0
                          ? `Select exactly ${count} user(s) to match selected servers.`
                          : 'Select servers first, then match the same number of users.'}
                      </p>
                      {count > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const needed = Math.min(count, users.length);
                            const allMatched =
                              selectedUserIds.size === needed &&
                              users.slice(0, needed).every((u) => selectedUserIds.has(u.id));
                            if (allMatched) {
                              setSelectedUserIds(new Set());
                              return;
                            }
                            setSelectedUserIds(new Set(users.slice(0, needed).map((u) => u.id)));
                          }}
                          className="text-sm font-medium hover:underline"
                          style={tenantAccentText(accentColor)}
                        >
                          {selectedUserIds.size === Math.min(count, users.length) &&
                          users.slice(0, Math.min(count, users.length)).every((u) => selectedUserIds.has(u.id))
                            ? 'Deselect users'
                            : `Select first ${Math.min(count, users.length)}`}
                        </button>
                      ) : null}
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {users.map((u) => (
                        <label key={u.id} className="flex items-center gap-3 p-2 border rounded-lg cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(u.id)}
                            disabled={!selectedUserIds.has(u.id) && selectedUserIds.size >= count && count > 0}
                            onChange={() => {
                              setSelectedUserIds((prev) => {
                                const next = new Set(prev);
                                next.has(u.id) ? next.delete(u.id) : count === 0 || next.size < count ? next.add(u.id) : next;
                                return next;
                              });
                            }}
                          />
                          <span className="text-sm">{u.email}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Access schedule</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Optional weekly hours applied to every successfully assigned server.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Set hours
              </label>
            </div>
            {scheduleEnabled ? (
              <div className="mt-4">
                <WeeklyAccessHoursEditor
                  value={scheduleValue}
                  onChange={setScheduleValue}
                  disabled={submitting}
                />
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full py-3 text-white font-medium rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
            style={tenantAccentButton(accentColor)}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitting ? 'Assigning...' : `Assign ${count} server${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}
