'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import type { AdminServiceKey } from '@/lib/adminServicesApi';
import { CreateProjectModal } from '@/components/console/CreateProjectModal';
import {
  fetchSuperAdminExternalVmTargets,
  type SuperAdminTargetOption,
} from '@/lib/superAdminTargetsApi';
import {
  PLAN_DURATIONS,
  assignCredential,
  bulkAssignInventory,
  fetchInventoryAssignees,
  fetchInventoryProjects,
  setAssignmentOverride,
  unassignCredential,
  updateInventoryServer,
  upsertInventoryCredential,
  type InventoryAssigneeOption,
  type InventoryProjectOption,
  type PlanDuration,
  type VmInventoryRow,
  type VmType,
} from '@/lib/vmInventoryApi';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

/** Inventory VMs are external servers, so projects created here enable that service. */
const INVENTORY_PROJECT_SERVICES: AdminServiceKey[] = ['elastic-servers'];

/** Mirrors the server's `seriesPassword` rules so the operator gets inline feedback. */
function validateNewUserPassword(value: string): string | null {
  if (value.length < 8) return 'At least 8 characters';
  if (!/[A-Z]/.test(value)) return 'Needs an uppercase letter';
  if (!/[a-z]/.test(value)) return 'Needs a lowercase letter';
  if (!/[0-9]/.test(value)) return 'Needs a number';
  if (!/[^A-Za-z0-9]/.test(value)) return 'Needs a special character';
  return null;
}

const toDateInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

interface VmInventoryManageModalProps {
  row: VmInventoryRow;
  onClose: () => void;
  onChanged: () => void;
}

export function VmInventoryManageModal({
  row,
  onClose,
  onChanged,
}: VmInventoryManageModalProps) {
  const [tab, setTab] = useState<'details' | 'logins' | 'assign'>('details');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Outcome of the last action, when it did more than the button implies. */
  const [notice, setNotice] = useState<string | null>(null);

  // ── Details ──────────────────────────────────────────────────────────
  const [vmType, setVmType] = useState<VmType>((row.vmType as VmType) ?? 'rdp');
  const [vmSpec, setVmSpec] = useState(row.vmSpec ?? '');
  const [planDuration, setPlanDuration] = useState<PlanDuration | ''>(
    (row.planDuration as PlanDuration | null) ?? ''
  );
  const [provider, setProvider] = useState(row.provider ?? '');
  const [providerStart, setProviderStart] = useState(toDateInput(row.providerStartDate));
  const [providerEnd, setProviderEnd] = useState(toDateInput(row.providerEndDate));

  // ── Logins ───────────────────────────────────────────────────────────
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // ── Editing an existing login ────────────────────────────────────────
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // ── Assign ───────────────────────────────────────────────────────────
  const [credentialId, setCredentialId] = useState<string>(
    row.credentials.find((c) => c.credentialId)?.credentialId ?? ''
  );
  const [assignees, setAssignees] = useState<InventoryAssigneeOption[]>([]);
  const [projects, setProjects] = useState<InventoryProjectOption[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // Free-pool servers have no owner, so the operator picks one here; that owner
  // scopes the user and project lists and is adopted by the server on assign.
  const [targets, setTargets] = useState<{
    admins: SuperAdminTargetOption[];
    tenants: SuperAdminTargetOption[];
  }>({ admins: [], tenants: [] });
  const [pickedOwnerType, setPickedOwnerType] = useState<'admin' | 'tenant'>('admin');
  const [pickedOwnerId, setPickedOwnerId] = useState('');

  const [assignMode, setAssignMode] = useState<'existing' | 'new'>('existing');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');

  const owner = row.owner;
  const hasOwner = Boolean(owner.adminId || owner.tenantId);

  const effectiveOwner = useMemo((): { type: 'admin' | 'tenant'; id: string } | null => {
    if (owner.tenantId) return { type: 'tenant', id: owner.tenantId };
    if (owner.adminId) return { type: 'admin', id: owner.adminId };
    if (pickedOwnerId) return { type: pickedOwnerType, id: pickedOwnerId };
    return null;
  }, [owner.tenantId, owner.adminId, pickedOwnerType, pickedOwnerId]);

  // Owner candidates are only needed while the server is still unowned.
  useEffect(() => {
    if (tab !== 'assign' || hasOwner) return;
    let cancelled = false;
    fetchSuperAdminExternalVmTargets()
      .then((t) => {
        if (!cancelled) setTargets(t);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load owners.');
      });
    return () => {
      cancelled = true;
    };
  }, [tab, hasOwner]);

  useEffect(() => {
    if (tab !== 'assign' || !effectiveOwner) return;
    let cancelled = false;
    setLoadingOptions(true);
    const params =
      effectiveOwner.type === 'tenant'
        ? { tenantId: effectiveOwner.id }
        : { adminId: effectiveOwner.id };

    Promise.all([fetchInventoryAssignees(params), fetchInventoryProjects(params)])
      .then(([a, p]) => {
        if (cancelled) return;
        setAssignees(a);
        setProjects(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load options.');
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, effectiveOwner]);

  const reloadProjects = useCallback(async () => {
    if (!effectiveOwner) return;
    const params =
      effectiveOwner.type === 'tenant'
        ? { tenantId: effectiveOwner.id }
        : { adminId: effectiveOwner.id };
    try {
      setProjects(await fetchInventoryProjects(params));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load projects.');
    }
  }, [effectiveOwner]);

  const guard = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await fn();
        onChanged();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [onChanged]
  );

  const saveDetails = () =>
    guard(async () => {
      if (!row.serverId) throw new ApiError('This row is not an inventory-owned server.', 400);
      await updateInventoryServer(row.serverId, {
        vmType,
        vmSpec: vmSpec.trim() || null,
        planDuration: planDuration || null,
        provider: provider.trim() || null,
        providerStartDate: providerStart ? new Date(providerStart).toISOString() : null,
        providerEndDate: providerEnd ? new Date(providerEnd).toISOString() : null,
      });
    });

  const addLogin = () =>
    guard(async () => {
      if (!row.serverId) throw new ApiError('This row is not an inventory-owned server.', 400);
      await upsertInventoryCredential(row.serverId, {
        username: newUsername.trim(),
        password: newPassword,
      });
      setNewUsername('');
      setNewPassword('');
    });

  function startEditLogin(credentialId: string, username: string) {
    setEditingCredentialId(credentialId);
    setEditUsername(username);
    setEditPassword('');
    setError(null);
  }

  function cancelEditLogin() {
    setEditingCredentialId(null);
    setEditUsername('');
    setEditPassword('');
  }

  const saveLogin = (credentialId: string) =>
    guard(async () => {
      if (!row.serverId) throw new ApiError('This row is not an inventory-owned server.', 400);
      if (!editUsername.trim()) throw new ApiError('Username is required.', 400);
      await upsertInventoryCredential(row.serverId, {
        credentialId,
        username: editUsername.trim(),
        // Omitted means "keep the stored password".
        ...(editPassword ? { password: editPassword } : {}),
      });
      cancelEditLogin();
    });

  /**
   * Release one login. What it changed depends on the rest of the VM, so the
   * outcome is reported rather than assumed.
   */
  const doUnassign = (assignmentId: string) =>
    guard(async () => {
      const res = await unassignCredential(assignmentId);
      const parts = ['Login unassigned.'];
      if (res.userDeleted) parts.push('Portal user removed.');
      if (res.serverFreed) parts.push('VM is back in the free pool.');
      else if (res.remainingLogins > 0) {
        parts.push(
          `${res.remainingLogins} login${res.remainingLogins === 1 ? '' : 's'} still assigned, so the VM keeps its owner.`
        );
      }
      setNotice(parts.join(' '));
    });

  const doAssign = () =>
    guard(async () => {
      const assignee = assignees.find((a) => a.id === assigneeId);
      if (!assignee) throw new ApiError('Pick a user to assign.', 400);
      await assignCredential({
        credentialId,
        assigneeType: assignee.assigneeType,
        assigneeId: assignee.id,
        projectId,
      });
      setAssigneeId('');
      setProjectId('');
    });

  /**
   * Create one user for this login and grant it. Reuses the bulk-assign service
   * with a single row so the ownership, collision and project-date checks are
   * identical to the Server Assign page.
   */
  const createUserAndAssign = () =>
    guard(async () => {
      if (!effectiveOwner) throw new ApiError('Pick an owner for this server first.', 400);
      if (!credentialId) throw new ApiError('Pick a login.', 400);
      if (!projectId) throw new ApiError('Pick a project.', 400);
      const pwError = validateNewUserPassword(newUserPassword);
      if (pwError) throw new ApiError(`Password: ${pwError.toLowerCase()}.`, 400);

      const result = await bulkAssignInventory({
        credentialIds: [credentialId],
        targetType: effectiveOwner.type,
        targetId: effectiveOwner.id,
        projectId,
        emails: [newUserEmail.trim()],
        passwordMode: 'shared',
        sharedPassword: newUserPassword,
        dryRun: false,
      });

      // A single row reports its own reason for failing; surface it verbatim.
      const failed = result.rows.find((r) => r.status === 'failed');
      if (failed) throw new ApiError(failed.error ?? 'Could not create and assign the user.', 400);

      setNewUserEmail('');
      setNewUserPassword('');
      setProjectId('');
    });

  const selectedProject = projects.find((p) => p.id === projectId);
  const editableCredentials = row.credentials.filter((c) => c.credentialId);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="font-mono text-lg font-semibold text-gray-900">{row.ipAddress}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {owner.tenantName ?? owner.adminEmail ?? 'Unassigned — free pool'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-100 px-6">
          {(
            [
              ['details', 'Details'],
              ['logins', `Logins (${editableCredentials.length})`],
              ['assign', 'Assign'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                tab === key
                  ? 'border-[#B91C1C] text-[#B91C1C]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
              {notice}
            </div>
          )}

          {!row.serverId && tab !== 'assign' && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              This IP comes from {row.sources.join(', ')} and is read-only here. Manage it in its
              own console.
            </div>
          )}

          {tab === 'details' && row.serverId && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="vmType">
                  VM type
                </label>
                <select
                  id="vmType"
                  className={inputClass}
                  value={vmType}
                  onChange={(e) => setVmType(e.target.value as VmType)}
                >
                  <option value="rdp">rdp</option>
                  <option value="ssh">ssh</option>
                  <option value="vnc">vnc</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="vmSpec">
                  VM spec
                </label>
                <input
                  id="vmSpec"
                  className={inputClass}
                  value={vmSpec}
                  onChange={(e) => setVmSpec(e.target.value)}
                  placeholder="Memory (8GB), Core (4), Disk (250GB)"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="planDuration">
                  Plan duration
                </label>
                <select
                  id="planDuration"
                  className={inputClass}
                  value={planDuration}
                  onChange={(e) => setPlanDuration(e.target.value as PlanDuration | '')}
                >
                  <option value="">—</option>
                  {PLAN_DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="provider">
                  Provider
                </label>
                <input
                  id="provider"
                  className={inputClass}
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder="Contabo"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="providerStart">
                  Provider start date
                </label>
                <input
                  id="providerStart"
                  type="date"
                  className={inputClass}
                  value={providerStart}
                  onChange={(e) => setProviderStart(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="providerEnd">
                  Provider end date
                </label>
                <input
                  id="providerEnd"
                  type="date"
                  className={inputClass}
                  value={providerEnd}
                  onChange={(e) => setProviderEnd(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => void saveDetails()}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save details
                </button>
              </div>
            </div>
          )}

          {tab === 'logins' && row.serverId && (
            <div className="space-y-4">
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {editableCredentials.length === 0 && (
                  <p className="px-4 py-3 text-sm text-gray-500">No logins yet.</p>
                )}
                {editableCredentials.map((cred) => (
                  <div key={cred.credentialId} className="px-4 py-3">
                    {editingCredentialId === cred.credentialId ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Username
                            </label>
                            <input
                              className={inputClass}
                              value={editUsername}
                              onChange={(e) => setEditUsername(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              New password
                            </label>
                            <input
                              className={inputClass}
                              type="password"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              placeholder="Leave blank to keep current"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void saveLogin(cred.credentialId!)}
                            disabled={busy || !editUsername.trim()}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
                          >
                            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                            Save login
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditLogin}
                            disabled={busy}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-sm text-gray-900">{cred.username}</p>
                        <button
                          type="button"
                          onClick={() => startEditLogin(cred.credentialId!, cred.username ?? '')}
                          disabled={busy}
                          className="text-xs font-semibold text-[#B91C1C] hover:underline disabled:opacity-50"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                    {cred.assignments.length === 0 ? (
                      <p className="mt-1 text-xs text-gray-500">Not assigned</p>
                    ) : (
                      <ul className="mt-1.5 space-y-1.5">
                        {cred.assignments.map((a) => (
                          <li
                            key={a.assignmentId}
                            className="flex flex-wrap items-center gap-2 text-xs text-gray-600"
                          >
                            <span className="font-medium text-gray-800">
                              {a.email ?? a.username ?? a.assigneeId}
                            </span>
                            <span className="text-gray-400">·</span>
                            <span>{a.projectName ?? 'no project'}</span>
                            {a.accessOverride && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200">
                                <ShieldCheck className="h-3 w-3" />
                                override
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                void guard(() =>
                                  setAssignmentOverride(a.assignmentId, {
                                    accessOverride: !a.accessOverride,
                                  })
                                )
                              }
                              disabled={busy}
                              className="text-[#B91C1C] hover:underline disabled:opacity-50"
                            >
                              {a.accessOverride ? 'Remove override' : 'Grant override'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void doUnassign(a.assignmentId)}
                              disabled={busy}
                              title="Release this login, remove its portal user and free the VM if nothing else is assigned"
                              className="inline-flex items-center gap-1 text-rose-600 hover:underline disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              Unassign
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="mb-3 text-sm font-medium text-gray-700">Add another login</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className={inputClass}
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Username"
                  />
                  <input
                    className={inputClass}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Password"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void addLogin()}
                  disabled={busy || !newUsername.trim() || !newPassword}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Add login
                </button>
              </div>
            </div>
          )}

          {tab === 'assign' && (
            <div className="space-y-4">
              {!hasOwner && (
                <div className="space-y-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200">
                  <p className="text-sm text-amber-800">
                    This server has no owner yet. Pick the admin or tenant it belongs to — the
                    server is mapped to them when you assign.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} htmlFor="ownerType">
                        Owner type
                      </label>
                      <select
                        id="ownerType"
                        className={inputClass}
                        value={pickedOwnerType}
                        onChange={(e) => {
                          setPickedOwnerType(e.target.value as 'admin' | 'tenant');
                          setPickedOwnerId('');
                          setAssigneeId('');
                          setProjectId('');
                        }}
                      >
                        <option value="admin">Platform admin</option>
                        <option value="tenant">Tenant</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="ownerId">
                        {pickedOwnerType === 'admin' ? 'Admin' : 'Tenant'}
                      </label>
                      <select
                        id="ownerId"
                        className={inputClass}
                        value={pickedOwnerId}
                        onChange={(e) => {
                          setPickedOwnerId(e.target.value);
                          setAssigneeId('');
                          setProjectId('');
                        }}
                      >
                        <option value="">Select…</option>
                        {(pickedOwnerType === 'admin' ? targets.admins : targets.tenants).map(
                          (o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              {editableCredentials.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Only servers added to the inventory can be assigned. Add a login first.
                </p>
              ) : (
                <>
                  <div>
                    <label className={labelClass} htmlFor="credential">
                      Login
                    </label>
                    <select
                      id="credential"
                      className={inputClass}
                      value={credentialId}
                      onChange={(e) => setCredentialId(e.target.value)}
                    >
                      {editableCredentials.map((c) => (
                        <option key={c.credentialId} value={c.credentialId!}>
                          {c.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  {loadingOptions ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading users and projects…
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className={labelClass}>Assign to</span>
                        <div className="mb-2 flex gap-1 rounded-lg bg-gray-100 p-1">
                          {(
                            [
                              ['existing', 'Existing user'],
                              ['new', 'New user'],
                            ] as const
                          ).map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setAssignMode(key)}
                              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                                assignMode === key
                                  ? 'bg-white text-gray-900 shadow-sm'
                                  : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {assignMode === 'existing' ? (
                          <>
                            <select
                              id="assignee"
                              className={inputClass}
                              value={assigneeId}
                              onChange={(e) => setAssigneeId(e.target.value)}
                              disabled={!effectiveOwner}
                            >
                              <option value="">Select a user…</option>
                              {assignees.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.email}
                                  {a.username ? ` (${a.username})` : ''}
                                </option>
                              ))}
                            </select>
                            {effectiveOwner && assignees.length === 0 && (
                              <p className="mt-1.5 text-xs text-gray-500">
                                No eligible users found for this owner.
                              </p>
                            )}
                          </>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label
                                className="mb-1 block text-xs font-medium text-gray-600"
                                htmlFor="newUserEmail"
                              >
                                Email
                              </label>
                              <input
                                id="newUserEmail"
                                type="email"
                                className={inputClass}
                                value={newUserEmail}
                                onChange={(e) => setNewUserEmail(e.target.value)}
                                placeholder="labuser@gmail.com"
                                disabled={!effectiveOwner}
                              />
                            </div>
                            <div>
                              <label
                                className="mb-1 block text-xs font-medium text-gray-600"
                                htmlFor="newUserPassword"
                              >
                                Password
                              </label>
                              <input
                                id="newUserPassword"
                                type="password"
                                className={inputClass}
                                value={newUserPassword}
                                onChange={(e) => setNewUserPassword(e.target.value)}
                                placeholder="Password@123"
                                disabled={!effectiveOwner}
                              />
                              {newUserPassword && validateNewUserPassword(newUserPassword) && (
                                <p className="mt-1 text-xs text-rose-600">
                                  {validateNewUserPassword(newUserPassword)}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className={labelClass} htmlFor="project">
                          Project (sets client dates)
                        </label>
                        <select
                          id="project"
                          className={inputClass}
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          disabled={!effectiveOwner}
                        >
                          <option value="">Select a project…</option>
                          {projects.map((p) => {
                            const undated = !p.startDate || !p.endDate;
                            return (
                              <option key={p.id} value={p.id} disabled={undated}>
                                {p.name} — {p.clientName}
                                {undated ? ' (no client dates set)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        {selectedProject?.startDate && selectedProject.endDate && (
                          <p className="mt-1.5 text-xs text-gray-600">
                            Client dates: {selectedProject.startDate.slice(0, 10)} →{' '}
                            {selectedProject.endDate.slice(0, 10)}
                          </p>
                        )}
                        {effectiveOwner && projects.length === 0 && (
                          <p className="mt-1.5 text-xs text-amber-700">
                            This owner has no active project.
                          </p>
                        )}
                        {effectiveOwner && (
                          <button
                            type="button"
                            onClick={() => setCreateProjectOpen(true)}
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#B91C1C] hover:underline"
                          >
                            + Create new project
                          </button>
                        )}
                      </div>

                      {assignMode === 'existing' ? (
                        <button
                          type="button"
                          onClick={() => void doAssign()}
                          disabled={busy || !credentialId || !assigneeId || !projectId}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
                        >
                          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                          Assign
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void createUserAndAssign()}
                          disabled={
                            busy ||
                            !credentialId ||
                            !projectId ||
                            !newUserEmail.trim() ||
                            Boolean(validateNewUserPassword(newUserPassword))
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          Create user &amp; assign
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {effectiveOwner && (
        <CreateProjectModal
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          portal={effectiveOwner.type === 'tenant' ? 'tenant' : 'org'}
          owner={effectiveOwner}
          preselectedServices={INVENTORY_PROJECT_SERVICES}
          lockServices
          onCreated={(project) => {
            setProjectId(project.id);
            void reloadProjects();
          }}
        />
      )}
    </div>
  );
}
