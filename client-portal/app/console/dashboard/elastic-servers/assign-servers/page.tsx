'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { tenantAccentButton, tenantAccentSurface, tenantAccentText } from '@/lib/tenantAccentStyles';
import { fetchTenantUsers } from '@/lib/tenantVmApi';
import {
  assignTenantExternalVMs,
  fetchAssignedTenantExternalVMsForUser,
  fetchAvailableTenantExternalVMs,
  fetchTenantExternalVMAssignCounts,
  unassignTenantExternalVM,
  updateTenantExternalVmOverride,
  updateTenantExternalVmSchedule,
  type IExternalVM,
} from '@/lib/tenantExternalVmApi';
import { AccessScheduleBadge } from '@/components/access-schedule/AccessScheduleBadge';
import { EditAccessScheduleModal } from '@/components/access-schedule/EditAccessScheduleModal';
import {
  GrantAccessOverrideModal,
  type AccessOverridePayload,
} from '@/components/access-schedule/GrantAccessOverrideModal';
import { WeeklyAccessHoursEditor } from '@/components/access-schedule/WeeklyAccessHoursEditor';
import { ApiError } from '@/lib/apiClient';
import {
  buildWeeklyAccessSchedule,
  createDefaultWeeklyEditorValue,
  formatAccessScheduleDigest,
  toAccessSchedule,
  type AccessScheduleInput,
  type WeeklyAccessEditorValue,
} from '@/lib/accessSchedule';
import type { TenantUserProfile } from '@/types/tenantPortal';
import { UserCheck, X, Server, CheckSquare, Square, AlertCircle, Loader2, ChevronRight, CalendarClock, Shield } from 'lucide-react';

function ServerCard({
  vm,
  accentColor,
  selectable,
  selected,
  onToggle,
  action,
  actionLabel,
  actionLoading,
}: {
  vm: IExternalVM;
  accentColor: string;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  action?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
        selectable
          ? selected
            ? 'cursor-pointer'
            : 'border-gray-200 bg-white hover:bg-gray-50 cursor-pointer'
          : 'border-gray-200 bg-white'
      }`}
      style={selectable && selected ? tenantAccentSurface(accentColor, 0.1) : undefined}
      onClick={selectable ? onToggle : undefined}
    >
      {selectable && (
        <span className="shrink-0" style={selected ? tenantAccentText(accentColor) : { color: '#9ca3af' }}>
          {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
        </span>
      )}
      <Server className="w-4 h-4 text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{vm.name}</p>
        <p className="text-xs text-gray-400 font-mono">{vm.ipAddress}</p>
        {(vm.assignedTenantUserIds?.length ?? 0) > 0 ? (
          <p className="mt-0.5 text-[11px] text-amber-700">
            Shared with {vm.assignedTenantUserIds!.length} user
            {vm.assignedTenantUserIds!.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
      {action && (
        <button
          onClick={(e) => { e.stopPropagation(); action(); }}
          disabled={actionLoading}
          className="text-xs px-2.5 py-1 rounded-lg border font-medium"
          style={tenantAccentSurface(accentColor, 0.08)}
        >
          <span style={tenantAccentText(accentColor)}>
            {actionLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : actionLabel}
          </span>
        </button>
      )}
    </div>
  );
}

function AssignDrawer({
  userId,
  userEmail,
  accentColor,
  onClose,
  onChanged,
}: {
  userId: string;
  userEmail: string;
  accentColor: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [assigned, setAssigned] = useState<IExternalVM[]>([]);
  const [available, setAvailable] = useState<IExternalVM[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleValue, setScheduleValue] = useState<WeeklyAccessEditorValue>(() =>
    createDefaultWeeklyEditorValue()
  );
  const [scheduleTarget, setScheduleTarget] = useState<IExternalVM | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<IExternalVM | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([
        fetchAssignedTenantExternalVMsForUser(userId),
        fetchAvailableTenantExternalVMs(userId),
      ]);
      setAssigned(a);
      setAvailable(b);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load servers.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b">
          <div>
            <h2 className="text-base font-semibold">Manage Servers</h2>
            <p className="text-xs text-gray-400 truncate">{userEmail}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        {error && <p className="mx-6 mt-4 text-sm text-red-600">{error}</p>}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: accentColor }} />
          ) : (
            <>
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Assigned ({assigned.length})</h3>
                <div className="space-y-2">
                  {assigned.map((vm) => {
                    const schedule = toAccessSchedule(vm.accessSchedule);
                    return (
                      <div key={vm._id} className="space-y-1">
                        <ServerCard
                          vm={vm}
                          accentColor={accentColor}
                          action={async () => {
                            setUnassigningId(vm._id);
                            await unassignTenantExternalVM(vm._id, userId);
                            onChanged();
                            await load();
                            setUnassigningId(null);
                          }}
                          actionLabel="Unassign"
                          actionLoading={unassigningId === vm._id}
                        />
                        <div className="flex items-center justify-between gap-2 px-1">
                          <div className="min-w-0">
                            <AccessScheduleBadge schedule={schedule} />
                            <p className="mt-0.5 truncate text-[11px] text-gray-400" title={formatAccessScheduleDigest(schedule)}>
                              {formatAccessScheduleDigest(schedule)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setScheduleTarget(vm)}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                            >
                              <CalendarClock className="h-3 w-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setOverrideTarget(vm)}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 hover:bg-amber-100"
                            >
                              <Shield className="h-3 w-3" />
                              Override
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">
                  Available for this user ({available.length})
                </h3>
                <p className="mb-2 text-xs text-gray-400">
                  Includes servers shared with other users — assigning grants this user access too.
                </p>
                <div className="space-y-2">
                  {available.map((vm) => (
                    <ServerCard
                      key={vm._id}
                      vm={vm}
                      accentColor={accentColor}
                      selectable
                      selected={selected.has(vm._id)}
                      onToggle={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          next.has(vm._id) ? next.delete(vm._id) : next.add(vm._id);
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
              </section>
              {available.length > 0 ? (
                <section className="space-y-3">
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-gray-700">
                    <span>
                      <span className="font-medium text-gray-900">Access schedule</span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        Optional weekly hours applied when assigning selected servers
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={scheduleEnabled}
                      onChange={(e) => setScheduleEnabled(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                  </label>
                  {scheduleEnabled ? (
                    <WeeklyAccessHoursEditor
                      value={scheduleValue}
                      onChange={setScheduleValue}
                      disabled={assigning}
                    />
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>
        {!loading && available.length > 0 && (
          <div className="px-6 py-4 border-t flex justify-between items-center">
            <span className="text-sm text-gray-500">{selected.size} selected</span>
            <button
              disabled={selected.size === 0 || assigning}
              onClick={async () => {
                setAssigning(true);
                try {
                  const accessSchedule = scheduleEnabled
                    ? buildWeeklyAccessSchedule(scheduleValue)
                    : undefined;
                  await assignTenantExternalVMs(
                    userId,
                    Array.from(selected),
                    accessSchedule
                  );
                  setSelected(new Set());
                  onChanged();
                  await load();
                } finally {
                  setAssigning(false);
                }
              }}
              className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
              style={tenantAccentButton(accentColor)}
            >
              {assigning ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        )}
      </div>

      {scheduleTarget ? (
        <EditAccessScheduleModal
          open
          vmName={scheduleTarget.name}
          initialSchedule={toAccessSchedule(scheduleTarget.accessSchedule)}
          onClose={() => setScheduleTarget(null)}
          onSave={async (payload: AccessScheduleInput) => {
            await updateTenantExternalVmSchedule(scheduleTarget._id, payload);
            setScheduleTarget(null);
            onChanged();
            await load();
          }}
        />
      ) : null}

      {overrideTarget ? (
        <GrantAccessOverrideModal
          open
          vmName={overrideTarget.name}
          currentlyActive={Boolean(toAccessSchedule(overrideTarget.accessSchedule)?.override)}
          onClose={() => setOverrideTarget(null)}
          onSave={async (payload: AccessOverridePayload) => {
            await updateTenantExternalVmOverride(overrideTarget._id, payload);
            setOverrideTarget(null);
            onChanged();
            await load();
          }}
        />
      ) : null}
    </>
  );
}

export default function TenantElasticAssignServersPage() {
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const [users, setUsers] = useState<TenantUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerUser, setDrawerUser] = useState<{ id: string; email: string } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersResult, assignCounts] = await Promise.all([
        fetchTenantUsers(),
        fetchTenantExternalVMAssignCounts(),
      ]);
      setUsers(usersResult.users);
      setCounts(assignCounts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_admin') void load();
  }, [load, tenantUser?.role]);

  if (tenantUser?.role !== 'tenant_admin') return null;

  return (
    <div className="max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Assign Servers</h1>
          <p className="text-sm text-gray-500">
            Assign imported servers to tenant users. The same server can be shared with multiple users.
          </p>
        </div>
        <Link href={tenantConsole.elasticBulkAssign} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white" style={tenantAccentButton(accentColor)}>
          Bulk assign (1:1)
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} /></div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 space-y-3">
            <p>No users yet — create users or use Bulk Assign.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href={tenantConsole.elasticUsersCreate} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white" style={tenantAccentButton(accentColor)}>
                Create User
              </Link>
              <Link href={tenantConsole.elasticBulkAssign} className="text-sm hover:underline" style={tenantAccentText(accentColor)}>
                Bulk Assign (1:1)
              </Link>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Assigned Servers</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-50">
                  <td className="px-6 py-4 font-medium">{user.email}</td>
                  <td className="px-6 py-4">{counts[user.id] ?? 0}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setDrawerUser({ id: user.id, email: user.email })} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white rounded-lg" style={tenantAccentButton(accentColor)}>
                      Manage Servers <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawerUser && (
        <AssignDrawer
          userId={drawerUser.id}
          userEmail={drawerUser.email}
          accentColor={accentColor}
          onClose={() => setDrawerUser(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
