'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  PLAN_DURATIONS,
  assignCredential,
  fetchInventoryAssignees,
  fetchInventoryProjects,
  revokeAssignment,
  setAssignmentOverride,
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

  // ── Assign ───────────────────────────────────────────────────────────
  const [credentialId, setCredentialId] = useState<string>(
    row.credentials.find((c) => c.credentialId)?.credentialId ?? ''
  );
  const [assignees, setAssignees] = useState<InventoryAssigneeOption[]>([]);
  const [projects, setProjects] = useState<InventoryProjectOption[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loadingOptions, setLoadingOptions] = useState(false);

  const owner = row.owner;
  const hasOwner = Boolean(owner.adminId || owner.tenantId);

  useEffect(() => {
    if (tab !== 'assign' || !hasOwner) return;
    let cancelled = false;
    setLoadingOptions(true);
    const params = owner.tenantId
      ? { tenantId: owner.tenantId }
      : { adminId: owner.adminId! };

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
  }, [tab, hasOwner, owner.tenantId, owner.adminId]);

  const guard = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
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
              <div />
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
                    <p className="font-mono text-sm text-gray-900">{cred.username}</p>
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
                              onClick={() => void guard(() => revokeAssignment(a.assignmentId))}
                              disabled={busy}
                              className="inline-flex items-center gap-1 text-rose-600 hover:underline disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              Revoke
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
                <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                  This server has no owner yet. Assigning a user will map it to that user&apos;s
                  admin or tenant automatically.
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
                        <label className={labelClass} htmlFor="assignee">
                          Assign to
                        </label>
                        <select
                          id="assignee"
                          className={inputClass}
                          value={assigneeId}
                          onChange={(e) => setAssigneeId(e.target.value)}
                          disabled={!hasOwner}
                        >
                          <option value="">Select a user…</option>
                          {assignees.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.email}
                              {a.username ? ` (${a.username})` : ''}
                            </option>
                          ))}
                        </select>
                        {hasOwner && assignees.length === 0 && (
                          <p className="mt-1.5 text-xs text-gray-500">
                            No eligible users found for this owner.
                          </p>
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
                          disabled={!hasOwner}
                        >
                          <option value="">Select a project…</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {p.clientName}
                            </option>
                          ))}
                        </select>
                        {selectedProject && (
                          <p className="mt-1.5 text-xs text-gray-600">
                            Client dates: {selectedProject.startDate.slice(0, 10)} →{' '}
                            {selectedProject.endDate.slice(0, 10)}
                          </p>
                        )}
                        {hasOwner && projects.length === 0 && (
                          <p className="mt-1.5 text-xs text-amber-700">
                            No project has both a start and end date. Set them on the project
                            first.
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void doAssign()}
                        disabled={busy || !credentialId || !assigneeId || !projectId}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
                      >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        Assign
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
