'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  ChevronLeft,
  Cpu,
  ExternalLink,
  HardDrive,
  Loader2,
  MemoryStick,
  Monitor,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { VMStatusBadge, UsageBar } from '@/components/dashboard/VMStatusBadge';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { ApiError } from '@/lib/apiClient';
import { tenantAccentButton, tenantAccentSurface } from '@/lib/tenantAccentStyles';
import {
  formatBillingPeriod,
  formatPlanPeriodEnd,
  getPlanDisplayStatus,
  planExpiryLabel,
} from '@/lib/tenantPlanUtils';
import {
  assignTenantVms,
  bulkAssignTenantVms,
  fetchAssignedTenantVmsForUser,
  fetchTenantUsers,
  fetchTenantVm,
  fetchTenantVmAssignmentCounts,
  fetchTenantVmStatus,
  fetchTenantVms,
  openTenantVmConsole,
  restartTenantVm,
  startTenantVm,
  stopTenantVm,
  unassignTenantVm,
} from '@/lib/tenantPortalApi';
import type {
  BulkAssignTenantVmsInput,
  BulkAssignTenantVmsResult,
  TenantUserProfile,
  TenantVmDetails,
  TenantVmLiveStatus,
  TenantVmSummary,
} from '@/types/tenantPortal';
import type { VMStatus } from '@/lib/vmApi';

type TenantVmScope = 'admin' | 'user';
type PowerAction = 'start' | 'stop' | 'restart';
type BulkMode = 'create' | 'existing';
type PasswordMode = 'auto' | 'shared';

function isPlanExpired(vm: Pick<TenantVmSummary, 'planStatus' | 'planPeriodEnd'>): boolean {
  if (!vm.planStatus || !vm.planPeriodEnd) return false;
  return getPlanDisplayStatus({
    planStatus: vm.planStatus,
    planPeriodEnd: vm.planPeriodEnd,
  }) === 'expired';
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function scopeBasePath(scope: TenantVmScope): string {
  return scope === 'admin' ? '/tenant/dashboard/vms' : '/tenant/dashboard/my-vms';
}

function scopeHeading(scope: TenantVmScope): string {
  return scope === 'admin' ? 'Tenant VMs' : 'My VMs';
}

function openPopupShell(): Window | null {
  try {
    return window.open('', '_blank', 'noopener,noreferrer');
  } catch {
    return null;
  }
}

async function launchConsole(vmId: string, protocol?: 'rdp' | 'ssh' | 'vnc'): Promise<void> {
  const popup = openPopupShell();
  try {
    const session = await openTenantVmConsole(vmId, protocol);
    if (popup) {
      popup.location.href = session.clientUrl;
    } else {
      window.open(session.clientUrl, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    if (popup) popup.close();
    throw error;
  }
}

function PageNotice({
  children,
  tone = 'amber',
}: {
  children: React.ReactNode;
  tone?: 'amber' | 'blue';
}) {
  const styles =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-blue-200 bg-blue-50 text-blue-800';
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

function BulkAssignResultPanel({
  result,
  onClear,
}: {
  result: BulkAssignTenantVmsResult;
  onClear: () => void;
}) {
  const hasPasswords = result.pairs.some((pair) => pair.password);

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            {result.assigned} assigned
          </span>
          {result.failed > 0 ? (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              {result.failed} failed
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          Clear results
        </button>
      </div>

      {hasPasswords ? (
        <PageNotice>
          Save these credentials now. Passwords are shown once and will not be available later.
        </PageNotice>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">VM</th>
              <th className="px-4 py-3">User</th>
              {hasPasswords ? <th className="px-4 py-3">Password</th> : null}
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {result.pairs.map((pair) => (
              <tr key={pair.vmId} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">{pair.vmName}</td>
                <td className="px-4 py-3 text-gray-700">{pair.userEmail}</td>
                {hasPasswords ? (
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{pair.password ?? '—'}</td>
                ) : null}
                <td className="px-4 py-3">
                  {pair.status === 'assigned' ? (
                    <span className="text-xs font-medium text-green-700">Assigned</span>
                  ) : (
                    <span className="text-xs text-red-600" title={pair.error}>
                      Failed
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssignVmModal({
  open,
  vmNames,
  accentColor,
  users,
  loading,
  onSubmit,
  onClose,
}: {
  open: boolean;
  vmNames: string[];
  accentColor: string;
  users: TenantUserProfile[];
  loading: boolean;
  onSubmit: (userId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [userId, setUserId] = useState('');

  useEffect(() => {
    if (!open) return;
    setUserId((prev) => prev || (users.find((user) => user.isActive)?.id ?? ''));
  }, [open, users]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Assign VMs</h2>
            <p className="text-xs text-gray-500">{vmNames.length} VM(s) selected</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Selected VMs
            </p>
            <div className="flex flex-wrap gap-2">
              {vmNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Tenant user</label>
            <select
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {users.filter((user) => user.isActive).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!userId || loading}
              onClick={() => void onSubmit(userId)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={tenantAccentButton(accentColor)}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Assign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BulkAssignModal({
  open,
  accentColor,
  selectedVms,
  users,
  loading,
  onSubmit,
  onClose,
}: {
  open: boolean;
  accentColor: string;
  selectedVms: TenantVmSummary[];
  users: TenantUserProfile[];
  loading: boolean;
  onSubmit: (payload: BulkAssignTenantVmsInput) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<BulkMode>('create');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('auto');
  const [sharedPassword, setSharedPassword] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setMode('create');
    setEmailPrefix('');
    setPasswordMode('auto');
    setSharedPassword('');
    setSelectedUserIds([]);
  }, [open]);

  const selectedCount = selectedVms.length;
  const activeUsers = users.filter((user) => user.isActive);
  const canSubmit =
    mode === 'create'
      ? selectedCount > 0 &&
        emailPrefix.includes('@') &&
        (passwordMode === 'auto' || sharedPassword.trim().length > 0)
      : selectedCount > 0 && selectedUserIds.length === selectedCount;

  const previewPairs =
    mode === 'create' && emailPrefix.includes('@')
      ? (() => {
          const at = emailPrefix.lastIndexOf('@');
          if (at <= 0) return [];
          const local = emailPrefix.slice(0, at);
          const domain = emailPrefix.slice(at);
          return selectedVms.map((vm, index) => ({
            vmName: vm.name,
            userEmail: `${local}${index + 1}${domain}`,
          }));
        })()
      : selectedVms.map((vm, index) => ({
          vmName: vm.name,
          userEmail:
            activeUsers.find((user) => user.id === selectedUserIds[index])?.email ?? 'Select user',
        }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Bulk assign VMs</h2>
            <p className="text-xs text-gray-500">One VM per user, {selectedCount} VM(s) selected</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex rounded-lg border border-gray-200 p-1">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                mode === 'create' ? 'bg-red-50 text-[#B91C1C]' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Create users
            </button>
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                mode === 'existing' ? 'bg-red-50 text-[#B91C1C]' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Existing users
            </button>
          </div>

          {mode === 'create' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Email prefix</label>
                <input
                  value={emailPrefix}
                  onChange={(event) => setEmailPrefix(event.target.value)}
                  placeholder="student@college.edu"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Creates `name1@...`, `name2@...`, one per selected VM.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Password mode</label>
                <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      checked={passwordMode === 'auto'}
                      onChange={() => setPasswordMode('auto')}
                    />
                    Auto-generate one per user
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      checked={passwordMode === 'shared'}
                      onChange={() => setPasswordMode('shared')}
                    />
                    Use shared password
                  </label>
                  {passwordMode === 'shared' ? (
                    <input
                      value={sharedPassword}
                      onChange={(event) => setSharedPassword(event.target.value)}
                      type="text"
                      placeholder="Shared password"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Select exactly {selectedCount} active user(s) to match the selected VMs.
              </p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                {activeUsers.map((user) => {
                  const checked = selectedUserIds.includes(user.id);
                  const atLimit = !checked && selectedUserIds.length >= selectedCount;
                  return (
                    <label
                      key={user.id}
                      className={`flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-0 ${
                        atLimit ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={atLimit}
                        onChange={() =>
                          setSelectedUserIds((prev) =>
                            checked
                              ? prev.filter((id) => id !== user.id)
                              : [...prev, user.id]
                          )
                        }
                      />
                      <span className="text-sm text-gray-900">{user.email}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {previewPairs.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Preview
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">VM</th>
                      <th className="px-4 py-3">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPairs.map((pair) => (
                      <tr key={`${pair.vmName}-${pair.userEmail}`} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-gray-900">{pair.vmName}</td>
                        <td className="px-4 py-3 text-gray-700">{pair.userEmail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit || loading}
              onClick={() =>
                void onSubmit(
                  mode === 'create'
                    ? {
                        vmIds: selectedVms.map((vm) => vm.id),
                        mode: 'create',
                        emailPrefix: emailPrefix.trim().toLowerCase(),
                        passwordMode,
                        ...(passwordMode === 'shared'
                          ? { sharedPassword: sharedPassword.trim() }
                          : {}),
                      }
                    : {
                        vmIds: selectedVms.map((vm) => vm.id),
                        mode: 'existing',
                        userIds: selectedUserIds,
                      }
                )
              }
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={tenantAccentButton(accentColor)}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Bulk assign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanStatusCell({ vm }: { vm: TenantVmSummary }) {
  if (!vm.planStatus || !vm.planPeriodEnd) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const display = getPlanDisplayStatus({
    planStatus: vm.planStatus,
    planPeriodEnd: vm.planPeriodEnd,
  });

  return (
    <div className="space-y-1">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          display === 'expired'
            ? 'bg-red-50 text-red-700'
            : display === 'expiring_soon'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-green-50 text-green-700'
        }`}
      >
        {display === 'expiring_soon' ? 'Expiring soon' : display === 'expired' ? 'Expired' : 'Active'}
      </span>
      <p className="text-xs text-gray-500">{planExpiryLabel({ planStatus: vm.planStatus, planPeriodEnd: vm.planPeriodEnd })}</p>
    </div>
  );
}

export function TenantVmListView({ scope }: { scope: TenantVmScope }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();

  const [vms, setVms] = useState<TenantVmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [users, setUsers] = useState<TenantUserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkAssignTenantVmsResult | null>(null);

  const status = searchParams.get('status') ?? '';
  const node = searchParams.get('node') ?? '';
  const userId = searchParams.get('userId') ?? '';

  const loadUsers = useCallback(async () => {
    if (scope !== 'admin') return;
    setUsersLoading(true);
    try {
      const result = await fetchTenantUsers();
      setUsers(result.users);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to load tenant users.');
    } finally {
      setUsersLoading(false);
    }
  }, [addToast, scope]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result =
        scope === 'admin' && userId
          ? await fetchAssignedTenantVmsForUser(userId)
          : await fetchTenantVms({
              status: status || undefined,
              node: node || undefined,
            });
      const filtered =
        scope === 'admin' && userId
          ? result.vms.filter(
              (vm) => (!status || vm.status === status) && (!node || vm.node === node)
            )
          : result.vms;
      setVms(filtered);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VMs.');
    } finally {
      setLoading(false);
    }
  }, [node, scope, status, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nodes = useMemo(
    () => Array.from(new Set(vms.map((vm) => vm.node))).sort(),
    [vms]
  );

  const selectedVms = vms.filter((vm) => selectedIds.has(vm.id));
  const selectedAssignable = selectedVms.filter((vm) => !vm.assignment);
  const allSelectable = vms.filter((vm) => !vm.assignment);
  const allSelected =
    allSelectable.length > 0 && allSelectable.every((vm) => selectedIds.has(vm.id));

  const setQueryParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${scopeBasePath(scope)}?${next.toString()}`);
  };

  const performPowerAction = async (vm: TenantVmSummary, action: PowerAction) => {
    setActionId(`${action}:${vm.id}`);
    try {
      if (action === 'start') {
        await startTenantVm(vm.id);
      } else if (action === 'stop') {
        await stopTenantVm(vm.id);
      } else {
        await restartTenantVm(vm.id);
      }
      addToast('success', `${vm.name}: ${action} requested.`);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : `Failed to ${action} VM.`);
    } finally {
      setActionId(null);
    }
  };

  const handleConsole = async (vm: TenantVmSummary) => {
    setActionId(`console:${vm.id}`);
    try {
      await launchConsole(vm.id, vm.consoleProtocol);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to open console.');
    } finally {
      setActionId(null);
    }
  };

  const handleAssignSubmit = async (targetUserId: string) => {
    setActionId('assign');
    try {
      await assignTenantVms(
        targetUserId,
        selectedAssignable.map((vm) => vm.id)
      );
      addToast('success', `${selectedAssignable.length} VM(s) assigned.`);
      setAssignOpen(false);
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to assign VMs.');
    } finally {
      setActionId(null);
    }
  };

  const handleBulkSubmit = async (payload: BulkAssignTenantVmsInput) => {
    setActionId('bulk');
    try {
      const result = await bulkAssignTenantVms(payload);
      setBulkResult(result);
      setBulkOpen(false);
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Bulk assign failed.');
    } finally {
      setActionId(null);
    }
  };

  const handleUnassign = async (vm: TenantVmSummary) => {
    setActionId(`unassign:${vm.id}`);
    try {
      await unassignTenantVm(vm.id);
      addToast('success', `${vm.name} unassigned.`);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to unassign VM.');
    } finally {
      setActionId(null);
    }
  };

  const visibleTitle =
    scope === 'admin' && userId ? 'Assigned VMs' : scopeHeading(scope);

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <AssignVmModal
        open={assignOpen}
        vmNames={selectedAssignable.map((vm) => vm.name)}
        accentColor={accentColor}
        users={users}
        loading={actionId === 'assign' || usersLoading}
        onSubmit={handleAssignSubmit}
        onClose={() => setAssignOpen(false)}
      />

      <BulkAssignModal
        open={bulkOpen}
        accentColor={accentColor}
        selectedVms={selectedAssignable}
        users={users}
        loading={actionId === 'bulk' || usersLoading}
        onSubmit={handleBulkSubmit}
        onClose={() => setBulkOpen(false)}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{visibleTitle}</h1>
          <p className="text-sm text-gray-500">
            {scope === 'admin'
              ? 'View and operate provisioned tenant virtual machines.'
              : 'Access and operate your assigned virtual machines.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {scope === 'admin' && userId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>Showing VMs assigned to a selected tenant user.</span>
          <Link href="/tenant/dashboard/vms" className="font-medium underline">
            View all tenant VMs
          </Link>
        </div>
      ) : null}

      {bulkResult ? (
        <BulkAssignResultPanel result={bulkResult} onClear={() => setBulkResult(null)} />
      ) : null}

      {error && !loading ? (
        <ErrorState title="VMs unavailable" message={error} onRetry={() => void load()} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={status}
                onChange={(event) => setQueryParam('status', event.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                <option value="running">Running</option>
                <option value="stopped">Stopped</option>
                <option value="paused">Paused</option>
                <option value="suspended">Suspended</option>
                <option value="error">Error</option>
              </select>
              <select
                value={node}
                onChange={(event) => setQueryParam('node', event.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">All nodes</option>
                {nodes.map((nodeName) => (
                  <option key={nodeName} value={nodeName}>
                    {nodeName}
                  </option>
                ))}
              </select>
            </div>

            {scope === 'admin' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={selectedAssignable.length === 0}
                  onClick={() => {
                    void loadUsers();
                    setAssignOpen(true);
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
                >
                  Assign selected
                </button>
                <button
                  type="button"
                  disabled={selectedAssignable.length === 0}
                  onClick={() => {
                    void loadUsers();
                    setBulkOpen(true);
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
                >
                  Bulk 1:1
                </button>
              </div>
            ) : null}
          </div>

          {loading ? (
            <TableSkeleton rows={5} cols={8} embedded />
          ) : vms.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <Server className="h-7 w-7 text-[#B91C1C]" />
              </div>
              <p className="font-medium text-gray-700">No VMs yet.</p>
              <p className="mt-1 text-sm text-gray-500">
                {scope === 'admin'
                  ? 'Place an order and wait for provisioning.'
                  : 'Your tenant admin will assign virtual machines to your account.'}
              </p>
              {scope === 'admin' ? (
                <Link
                  href="/tenant/dashboard/orders"
                  className="mt-4 inline-flex text-sm font-medium text-[#B91C1C] hover:underline"
                >
                  Go to orders
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    {scope === 'admin' ? (
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() =>
                            setSelectedIds(
                              allSelected ? new Set() : new Set(allSelectable.map((vm) => vm.id))
                            )
                          }
                        />
                      </th>
                    ) : null}
                    <th className="px-4 py-3">VM</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Node / IP</th>
                    <th className="px-4 py-3">Specs</th>
                    <th className="px-4 py-3">Plan</th>
                    {scope === 'admin' ? <th className="px-4 py-3">Assigned</th> : null}
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm) => {
                    const expired = isPlanExpired(vm);
                    const isRunning = vm.status === 'running';
                    const isStopped = vm.status === 'stopped';
                    const selectionDisabled = Boolean(vm.assignment);
                    const detailHref = `${scopeBasePath(scope)}/${vm.id}`;

                    return (
                      <tr key={vm.id} className="border-b border-gray-50 align-top">
                        {scope === 'admin' ? (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              disabled={selectionDisabled}
                              checked={selectedIds.has(vm.id)}
                              onChange={() =>
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(vm.id)) next.delete(vm.id);
                                  else next.add(vm.id);
                                  return next;
                                })
                              }
                            />
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <Link href={detailHref} className="block">
                            <p className="font-medium text-gray-900 hover:text-[#B91C1C]">{vm.name}</p>
                            <p className="mt-1 text-xs text-gray-500">#{vm.vmid}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <VMStatusBadge status={vm.status as VMStatus} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <p>{vm.node}</p>
                          <p className="mt-1 font-mono text-gray-500">{vm.ipAddress ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {vm.allocatedCpu} vCPU
                          <br />
                          {vm.allocatedMemoryGb} GB RAM
                          <br />
                          {vm.allocatedDiskGb} GB disk
                        </td>
                        <td className="px-4 py-3">
                          <PlanStatusCell vm={vm} />
                        </td>
                        {scope === 'admin' ? (
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {vm.assignment ? (
                              <div>
                                <p className="font-medium text-gray-900">{vm.assignment.email}</p>
                                {!vm.assignment.isActive ? (
                                  <p className="mt-1 text-red-600">Inactive user</p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-gray-400">Unassigned</span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={detailHref}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              View
                            </Link>
                            <button
                              type="button"
                              disabled={expired || !isStopped || actionId === `start:${vm.id}`}
                              onClick={() => void performPowerAction(vm, 'start')}
                              className="rounded-lg border border-green-200 px-3 py-1.5 text-xs text-green-700 disabled:opacity-40"
                            >
                              {actionId === `start:${vm.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Start'
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={expired || !isRunning || actionId === `stop:${vm.id}`}
                              onClick={() => void performPowerAction(vm, 'stop')}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 disabled:opacity-40"
                            >
                              {actionId === `stop:${vm.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Stop'
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={expired || !isRunning || actionId === `restart:${vm.id}`}
                              onClick={() => void performPowerAction(vm, 'restart')}
                              className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-40"
                            >
                              {actionId === `restart:${vm.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Restart'
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={
                                expired ||
                                !isRunning ||
                                !vm.consoleReady ||
                                actionId === `console:${vm.id}`
                              }
                              onClick={() => void handleConsole(vm)}
                              className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs text-blue-700 disabled:opacity-40"
                            >
                              {actionId === `console:${vm.id}` ? 'Opening…' : 'Console'}
                            </button>
                            {scope === 'admin' ? (
                              vm.assignment ? (
                                <button
                                  type="button"
                                  disabled={actionId === `unassign:${vm.id}`}
                                  onClick={() => void handleUnassign(vm)}
                                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-40"
                                >
                                  {actionId === `unassign:${vm.id}` ? 'Removing…' : 'Unassign'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedIds(new Set([vm.id]));
                                    void loadUsers();
                                    setAssignOpen(true);
                                  }}
                                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700"
                                >
                                  Assign
                                </button>
                              )
                            ) : null}
                          </div>
                          {expired ? (
                            <p className="mt-2 text-xs text-red-600">
                              Plan expired.{' '}
                              {scope === 'admin' ? (
                                <Link href={`/tenant/dashboard/plans/${vm.id}`} className="underline">
                                  Renew in VM Plans
                                </Link>
                              ) : (
                                'Contact your tenant admin to renew this VM plan.'
                              )}
                            </p>
                          ) : null}
                          {!expired && isRunning && !vm.consoleReady ? (
                            <p className="mt-2 text-xs text-amber-600">Console preparing…</p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TenantVmDetailView({ scope }: { scope: TenantVmScope }) {
  const params = useParams<{ vmId: string }>();
  const vmId = params.vmId;
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();

  const [details, setDetails] = useState<TenantVmDetails | null>(null);
  const [liveStatus, setLiveStatus] = useState<TenantVmLiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<PowerAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [users, setUsers] = useState<TenantUserProfile[]>([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [unassignLoading, setUnassignLoading] = useState(false);

  const isAdmin = scope === 'admin';
  const backHref = scopeBasePath(scope);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const result = await fetchTenantUsers();
      setUsers(result.users);
      setAssignUserId((prev) => prev || (result.users.find((user) => user.isActive)?.id ?? ''));
    } catch {
      // non-critical
    }
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTenantVm(vmId);
      setDetails(data);
      setLiveStatus(data.liveStatus ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VM.');
    } finally {
      setLoading(false);
    }
  }, [vmId]);

  useEffect(() => {
    void load();
    void loadUsers();
  }, [load, loadUsers]);

  const refreshLive = useCallback(async () => {
    try {
      const status = await fetchTenantVmStatus(vmId);
      setLiveStatus(status);
    } catch {
      // best effort
    }
  }, [vmId]);

  useEffect(() => {
    if (!details || details.vm.status !== 'running' || details.vm.consoleReady) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [details, load]);

  if (loading && !details) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
        <ErrorState title="VM unavailable" message={error ?? 'VM not found.'} onRetry={() => void load()} />
      </div>
    );
  }

  const vm = details.vm;
  const expired = isPlanExpired(vm);
  const isRunning = vm.status === 'running';
  const isStopped = vm.status === 'stopped';
  const canConsole = isRunning && vm.consoleReady && !expired;

  const confirmDescription =
    action === 'start'
      ? `Start ${vm.name}?`
      : action === 'stop'
        ? `Gracefully stop ${vm.name}?`
        : `Restart ${vm.name}?`;

  const doAction = async () => {
    if (!action) return;
    setActionLoading(true);
    try {
      if (action === 'start') await startTenantVm(vm.id);
      if (action === 'stop') await stopTenantVm(vm.id);
      if (action === 'restart') await restartTenantVm(vm.id);
      addToast('success', `${vm.name}: ${action} requested.`);
      setAction(null);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : `Failed to ${action} VM.`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {action ? (
        <ConfirmModal
          open
          title={`${action[0]?.toUpperCase()}${action.slice(1)} VM`}
          description={confirmDescription}
          confirmLabel={action[0]?.toUpperCase() + action.slice(1)}
          confirmVariant="warning"
          loading={actionLoading}
          onConfirm={() => void doAction()}
          onCancel={() => setAction(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to {scopeHeading(scope)}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{vm.name}</h1>
            <VMStatusBadge status={vm.status as VMStatus} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            #{vm.vmid} · {vm.node}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshLive()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            disabled={expired || !isStopped}
            onClick={() => setAction('start')}
            className="inline-flex items-center gap-2 rounded-lg border border-green-200 px-3 py-2 text-sm text-green-700 disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            Start
          </button>
          <button
            type="button"
            disabled={expired || !isRunning}
            onClick={() => setAction('stop')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
          <button
            type="button"
            disabled={expired || !isRunning}
            onClick={() => setAction('restart')}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm text-amber-700 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            Restart
          </button>
          <button
            type="button"
            disabled={!canConsole || consoleLoading}
            onClick={async () => {
              setConsoleLoading(true);
              try {
                await launchConsole(vm.id, vm.consoleProtocol);
              } catch (err) {
                addToast('error', err instanceof ApiError ? err.message : 'Failed to open console.');
              } finally {
                setConsoleLoading(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={tenantAccentButton(accentColor)}
          >
            {consoleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
            Console
          </button>
        </div>
      </div>

      {expired ? (
        <PageNotice>
          Plan expired.{' '}
          {isAdmin ? (
            <Link href={`/tenant/dashboard/plans/${vm.id}`} className="font-medium underline">
              Renew this VM in VM Plans
            </Link>
          ) : (
            'Contact your tenant admin to renew this VM plan.'
          )}
        </PageNotice>
      ) : null}

      {!expired && isRunning && !vm.consoleReady ? (
        <PageNotice tone="blue">Console preparing… wait a moment and refresh if needed.</PageNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Activity className="h-4 w-4 text-gray-400" />
              {liveStatus ? 'Live status' : 'Resources'}
            </h2>
            {!liveStatus ? (
              <span className="text-xs text-gray-400">Start the VM to see live metrics</span>
            ) : null}
          </div>

          {liveStatus ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Cpu className="h-3.5 w-3.5" /> CPU
                  </span>
                  <span className="text-xs text-gray-600">{liveStatus.cpu.allocated} vCPU allocated</span>
                </div>
                <UsageBar pct={liveStatus.cpu.usagePercent} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <MemoryStick className="h-3.5 w-3.5" /> Memory
                  </span>
                  <span className="text-xs text-gray-600">
                    {liveStatus.memory.usedGb.toFixed(2)} / {liveStatus.memory.allocatedGb.toFixed(1)} GB
                  </span>
                </div>
                <UsageBar pct={liveStatus.memory.usagePercent} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <HardDrive className="h-3.5 w-3.5" /> Disk
                  </span>
                  <span className="text-xs text-gray-600">
                    {liveStatus.disk.usedGb.toFixed(2)} / {liveStatus.disk.allocatedGb.toFixed(1)} GB
                  </span>
                </div>
                <UsageBar
                  pct={
                    liveStatus.disk.allocatedGb > 0
                      ? (liveStatus.disk.usedGb / liveStatus.disk.allocatedGb) * 100
                      : 0
                  }
                />
              </div>
              <div className="grid gap-3 border-t border-gray-50 pt-2 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Network className="h-3.5 w-3.5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">IP address</p>
                    <p className="text-xs font-mono text-gray-700">{liveStatus.ipAddress ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">Uptime</p>
                    <p className="text-xs text-gray-700">{liveStatus.uptime.formatted}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'vCPU', value: `${vm.allocatedCpu} cores` },
                { label: 'Memory', value: `${vm.allocatedMemoryGb} GB` },
                { label: 'Disk', value: `${vm.allocatedDiskGb} GB` },
                { label: 'IP address', value: vm.ipAddress ?? '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-400">{item.label}</p>
                  <p className="mt-1 text-sm font-medium text-gray-800">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Server className="h-4 w-4 text-gray-400" />
              Summary
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Node</span>
                <span className="text-xs text-gray-700">{vm.node}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Plan</span>
                <span className="text-xs text-gray-700">
                  {vm.planStatus ? formatBillingPeriod(vm.billingPeriod ?? 'monthly') : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Period end</span>
                <span className="text-xs text-gray-700">
                  {vm.planPeriodEnd ? formatPlanPeriodEnd(vm.planPeriodEnd) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Console</span>
                <span className="text-xs text-gray-700">{vm.consoleProtocol.toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Updated</span>
                <span className="text-xs text-gray-700">{formatDateTime(vm.updatedAt)}</span>
              </div>
            </div>

            <div className="mt-4 border-t border-gray-100 pt-4">
              {isAdmin ? (
                <Link
                  href={`/tenant/dashboard/plans/${vm.id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#B91C1C] hover:underline"
                >
                  Open VM plan
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <p className="text-xs text-gray-500">
                  Contact your tenant admin for renewals and billing changes.
                </p>
              )}
            </div>
          </div>

          {isAdmin ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Users className="h-4 w-4 text-gray-400" />
                Assignment
              </h2>

              {vm.assignment ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-900">{vm.assignment.email}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {vm.assignment.isActive ? 'Active tenant user' : 'Inactive tenant user'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={unassignLoading}
                    onClick={async () => {
                      setUnassignLoading(true);
                      try {
                        await unassignTenantVm(vm.id);
                        addToast('success', 'VM unassigned.');
                        await load();
                      } catch (err) {
                        addToast('error', err instanceof ApiError ? err.message : 'Failed to unassign VM.');
                      } finally {
                        setUnassignLoading(false);
                      }
                    }}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-40"
                  >
                    {unassignLoading ? 'Removing…' : 'Unassign'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <select
                    value={assignUserId}
                    onChange={(event) => setAssignUserId(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="">Select tenant user</option>
                    {users.filter((user) => user.isActive).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!assignUserId || assignLoading}
                    onClick={async () => {
                      setAssignLoading(true);
                      try {
                        await assignTenantVms(assignUserId, [vm.id]);
                        addToast('success', 'VM assigned.');
                        await load();
                      } catch (err) {
                        addToast('error', err instanceof ApiError ? err.message : 'Failed to assign VM.');
                      } finally {
                        setAssignLoading(false);
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    style={tenantAccentButton(accentColor)}
                  >
                    {assignLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    Assign user
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
