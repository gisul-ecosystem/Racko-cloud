'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Loader2,
  Package,
  RotateCcw,
  Server,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import type { AdminServiceKey } from '@/lib/adminServicesApi';
import { WeeklyAccessHoursEditor } from '@/components/access-schedule/WeeklyAccessHoursEditor';
import {
  buildWeeklyAccessSchedule,
  createDefaultWeeklyEditorValue,
  type WeeklyAccessEditorValue,
} from '@/lib/accessSchedule';
import { CreateProjectModal } from '@/components/console/CreateProjectModal';
import { ProjectSelect } from '@/components/console/ProjectSelect';
import { InstallProgressPanel } from '@/components/super-admin-console/server-assign/InstallProgressPanel';
import { InstallRunHistory } from '@/components/super-admin-console/server-assign/InstallRunHistory';
import {
  JsonAssignUpload,
  type JsonAssignPair,
} from '@/components/super-admin-console/server-assign/JsonAssignUpload';
import { VmInventoryResetModal } from '@/components/super-admin-console/vm-inventory/VmInventoryResetModal';
import { useAuth } from '@/context/AuthContext';
import { fetchSuperAdminExternalVmTargets, type SuperAdminTargetOption } from '@/lib/superAdminTargetsApi';
import { fetchSoftwareCatalog, type ISoftwareCatalog } from '@/lib/machineManagerApi';
import {
  buildSeriesEmail,
  bulkAssignInventory,
  fetchInventoryProjects,
  fetchVmInventory,
  installInventorySoftware,
  type BulkAssignResult,
  type InstallSoftwareResult,
  type InventoryProjectOption,
  type VmInventoryRow,
} from '@/lib/vmInventoryApi';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';
const cardClass = 'rounded-xl border border-gray-100 bg-white p-5';

const MAX_ROWS = 250;

/**
 * Per-request ceiling for the prepare step. The reset endpoint allows 100, but
 * it may have to install agents first, and that path is capped at 50.
 */
const MAX_PREPARE_VMS = 50;

/** Inventory VMs are external servers, so projects created here enable that service. */
const INVENTORY_PROJECT_SERVICES: AdminServiceKey[] = ['elastic-servers'];

/** One selectable login: an inventory VM plus one of its usernames. */
interface LoginOption {
  credentialId: string;
  /** The VM behind the login, which is what agent push and reset act on. */
  serverId: string;
  ipAddress: string;
  username: string;
  vmSpec: string | null;
  vmType: string | null;
  assigned: boolean;
}

/** Mirrors the server's password policy so the operator gets inline feedback. */
function validateSharedPassword(value: string): string | null {
  if (value.length < 8) return 'At least 8 characters';
  if (!/[A-Z]/.test(value)) return 'Needs an uppercase letter';
  if (!/[a-z]/.test(value)) return 'Needs a lowercase letter';
  if (!/[0-9]/.test(value)) return 'Needs a number';
  if (!/[^A-Za-z0-9]/.test(value)) return 'Needs a special character';
  return null;
}

function toCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export default function ServerAssignPage() {
  const { isAuthenticated } = useAuth();

  // ── Target owner ─────────────────────────────────────────────────────
  const [targetType, setTargetType] = useState<'admin' | 'tenant'>('admin');
  const [targetId, setTargetId] = useState('');
  const [admins, setAdmins] = useState<SuperAdminTargetOption[]>([]);
  const [tenants, setTenants] = useState<SuperAdminTargetOption[]>([]);

  // ── Project ──────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<InventoryProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // ── Logins ───────────────────────────────────────────────────────────
  /** `json` pairs logins with users from a file, so no series is generated. */
  const [pickMode, setPickMode] = useState<'inventory' | 'json'>('inventory');
  const [jsonPairs, setJsonPairs] = useState<JsonAssignPair[]>([]);
  const [logins, setLogins] = useState<LoginOption[]>([]);
  const [loginsLoading, setLoginsLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [hideAssigned, setHideAssigned] = useState(true);
  const [vmTypeFilter, setVmTypeFilter] = useState('');
  const [vmSpecFilter, setVmSpecFilter] = useState('');

  // ── Prepare VMs (optional, run before assigning) ─────────────────────
  const [resetOpen, setResetOpen] = useState(false);
  const [prepareNotice, setPrepareNotice] = useState<string | null>(null);

  // ── Software ─────────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<ISoftwareCatalog[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [softwareIds, setSoftwareIds] = useState<string[]>([]);
  const [installResult, setInstallResult] = useState<InstallSoftwareResult | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  /** Bumped after an install so the history section pulls in the new run. */
  const [runsKey, setRunsKey] = useState(0);

  // ── Series ───────────────────────────────────────────────────────────
  /** `project` derives the base address from the client and its start day. */
  const [emailMode, setEmailMode] = useState<'manual' | 'project'>('manual');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [seriesDomain, setSeriesDomain] = useState('gmail.com');
  const [passwordMode, setPasswordMode] = useState<'auto' | 'shared'>('shared');
  const [sharedPassword, setSharedPassword] = useState('');

  // ── Schedule ─────────────────────────────────────────────────────────
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleValue, setScheduleValue] = useState<WeeklyAccessEditorValue>(() =>
    createDefaultWeeklyEditorValue(null)
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkAssignResult | null>(null);
  const [result, setResult] = useState<BulkAssignResult | null>(null);

  // ── Loaders ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSuperAdminExternalVmTargets()
      .then((t) => {
        setAdmins(t.admins);
        setTenants(t.tenants);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load admins and tenants.')
      );
  }, []);

  useEffect(() => {
    fetchSoftwareCatalog()
      .then(setCatalog)
      .catch((err) =>
        setCatalogError(
          err instanceof ApiError ? err.message : 'Could not load the software catalog.'
        )
      );
  }, []);

  const loadLogins = useCallback(async () => {
    setLoginsLoading(true);
    try {
      // Only inventory-owned rows carry assignable credentials.
      const res = await fetchVmInventory({ source: 'inventory', page: 1, pageSize: 200 });
      const flat: LoginOption[] = [];
      res.rows.forEach((row: VmInventoryRow) => {
        row.credentials.forEach((c) => {
          if (!c.credentialId || !row.serverId) return;
          flat.push({
            credentialId: c.credentialId,
            serverId: row.serverId,
            ipAddress: row.ipAddress,
            username: c.username ?? '—',
            vmSpec: row.vmSpec,
            vmType: row.vmType,
            assigned: c.assignments.length > 0,
          });
        });
      });
      setLogins(flat);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the inventory.');
    } finally {
      setLoginsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogins();
  }, [loadLogins]);

  const loadProjects = useCallback(async () => {
    if (!targetId) {
      setProjects([]);
      return;
    }
    setProjectsLoading(true);
    try {
      setProjects(
        await fetchInventoryProjects(
          targetType === 'admin' ? { adminId: targetId } : { tenantId: targetId }
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load projects.');
    } finally {
      setProjectsLoading(false);
    }
  }, [targetType, targetId]);

  // Projects depend on the chosen owner, so reset the selection when it changes.
  useEffect(() => {
    setProjectId('');
    void loadProjects();
  }, [loadProjects]);

  // Undated projects can't carry client dates, so list them as unavailable
  // rather than dropping them silently.
  const projectOptions = useMemo(
    () =>
      projects.map((p) => {
        const undated = !p.startDate || !p.endDate;
        return {
          id: p.id,
          name: p.name,
          clientName: p.clientName,
          disabled: undated,
          note: undated ? 'no client dates set' : undefined,
        };
      }),
    [projects]
  );
  const undatedCount = projectOptions.filter((p) => p.disabled).length;

  // ── Derived ──────────────────────────────────────────────────────────
  // Options come from what's actually in the inventory, so the dropdowns never
  // offer a value that matches nothing.
  const vmTypeOptions = useMemo(
    () => [...new Set(logins.map((l) => l.vmType).filter((v): v is string => Boolean(v)))].sort(),
    [logins]
  );
  const vmSpecOptions = useMemo(
    () => [...new Set(logins.map((l) => l.vmSpec).filter((v): v is string => Boolean(v)))].sort(),
    [logins]
  );

  const visibleLogins = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return logins.filter((l) => {
      if (hideAssigned && l.assigned) return false;
      if (vmTypeFilter && l.vmType !== vmTypeFilter) return false;
      if (vmSpecFilter && l.vmSpec !== vmSpecFilter) return false;
      if (!q) return true;
      return l.ipAddress.toLowerCase().includes(q) || l.username.toLowerCase().includes(q);
    });
  }, [logins, filter, hideAssigned, vmTypeFilter, vmSpecFilter]);

  const loginById = useMemo(
    () => new Map(logins.map((l) => [l.credentialId, l])),
    [logins]
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  /**
   * The local part the project implies: three letters of the client plus the
   * day its engagement starts, so "edforce" starting on the 21st gives "edf21"
   * and the series runs edf211, edf212 … Empty when the project cannot supply
   * one, which the UI reports instead of generating something arbitrary.
   */
  const projectSeriesLocal = useMemo(() => {
    if (!selectedProject?.startDate) return '';
    const letters = selectedProject.clientName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 3);
    if (!letters) return '';
    // Read as UTC: project dates are stored at midnight, and the local reading
    // would land on the day before for anyone west of it.
    const day = new Date(selectedProject.startDate).getUTCDate();
    return Number.isNaN(day) ? '' : `${letters}${day}`;
  }, [selectedProject]);

  const domain = seriesDomain.trim().toLowerCase().replace(/^@/, '');
  const emailBase =
    emailMode === 'project'
      ? projectSeriesLocal && domain
        ? `${projectSeriesLocal}@${domain}`
        : ''
      : emailPrefix.trim().toLowerCase();

  const passwordHint = passwordMode === 'shared' ? validateSharedPassword(sharedPassword) : null;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBase);

  // A file already carries its own emails and passwords, which is why the
  // user-series step drops out of the flow entirely.
  const fromJson = pickMode === 'json';
  const rowCount = fromJson ? jsonPairs.length : selected.length;

  const canSubmit =
    rowCount > 0 &&
    rowCount <= MAX_ROWS &&
    Boolean(targetId) &&
    Boolean(projectId) &&
    (fromJson ||
      (emailValid && (passwordMode === 'auto' || (sharedPassword.length > 0 && !passwordHint))));

  /** Pairing preview, in the exact order the server will use. */
  const pairs = useMemo(
    () =>
      selected.map((credentialId, i) => ({
        login: loginById.get(credentialId),
        email: buildSeriesEmail(emailBase, i + 1),
      })),
    [selected, loginById, emailBase]
  );

  const handleJsonChange = useCallback((next: JsonAssignPair[]) => {
    setPreview(null);
    setJsonPairs(next);
  }, []);

  const toggleLogin = useCallback((credentialId: string) => {
    setPreview(null);
    setSelected((prev) =>
      prev.includes(credentialId)
        ? prev.filter((id) => id !== credentialId)
        : prev.length >= MAX_ROWS
          ? prev
          : [...prev, credentialId]
    );
  }, []);

  /**
   * The VMs behind the current selection. Push, reset and install all act per
   * box, so two logins on one IP collapse to one machine.
   */
  const selectedVms = useMemo(() => {
    const byServerId = new Map<string, string>();
    if (fromJson) {
      jsonPairs.forEach((p) => byServerId.set(p.serverId, p.ipAddress));
    } else {
      selected.forEach((id) => {
        const login = loginById.get(id);
        if (login) byServerId.set(login.serverId, login.ipAddress);
      });
    }
    return {
      serverIds: [...byServerId.keys()],
      ipAddresses: [...byServerId.values()],
    };
  }, [fromJson, jsonPairs, selected, loginById]);

  const installMachineCount = selectedVms.serverIds.length;

  const toggleSoftware = useCallback((softwareId: string) => {
    setSoftwareIds((prev) =>
      prev.includes(softwareId) ? prev.filter((id) => id !== softwareId) : [...prev, softwareId]
    );
  }, []);

  const selectAllVisible = useCallback(() => {
    setPreview(null);
    setSelected((prev) => {
      const visible = visibleLogins.map((l) => l.credentialId);
      const allIn = visible.every((id) => prev.includes(id));
      if (allIn) return prev.filter((id) => !visible.includes(id));
      const next = [...prev];
      for (const id of visible) {
        if (next.length >= MAX_ROWS) break;
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
  }, [visibleLogins]);

  const submit = useCallback(
    async (dryRun: boolean) => {
      if (!canSubmit) return;
      setBusy(true);
      setError(null);
      try {
        const res = await bulkAssignInventory({
          credentialIds: fromJson ? jsonPairs.map((p) => p.credentialId) : selected,
          targetType,
          targetId,
          projectId,
          ...(fromJson
            ? {
                emails: jsonPairs.map((p) => p.email),
                passwordMode: 'per_row' as const,
                passwords: jsonPairs.map((p) => p.password),
              }
            : {
                emailPrefix: emailBase,
                passwordMode,
                ...(passwordMode === 'shared' ? { sharedPassword } : {}),
              }),
          ...(scheduleEnabled ? { accessSchedule: buildWeeklyAccessSchedule(scheduleValue) } : {}),
          dryRun,
        });
        if (dryRun) {
          setPreview(res);
        } else {
          // Only the logins that actually landed are worth installing on, and a
          // Machine Manager failure must not swallow the assignment results.
          const landed = res.rows.filter((r) => r.status === 'assigned');
          const assigned = landed.map((r) => r.credentialId);
          if (softwareIds.length > 0 && assigned.length > 0) {
            try {
              setInstallResult(
                // The context is what lets the run be read back later as "this
                // install, for this project and these users".
                await installInventorySoftware(assigned, softwareIds, {
                  targetType,
                  targetId,
                  ...(projectId ? { projectId } : {}),
                  assignedCount: landed.length,
                  assigned: landed.flatMap((r) =>
                    r.ipAddress ? [{ ipAddress: r.ipAddress, email: r.email }] : []
                  ),
                  ...(prepareNotice ? { resetSummary: prepareNotice } : {}),
                })
              );
              setRunsKey((k) => k + 1);
            } catch (err) {
              setInstallError(
                err instanceof ApiError ? err.message : 'Could not queue the install jobs.'
              );
            }
          }
          setResult(res);
          setPreview(null);
          setSelected([]);
          setJsonPairs([]);
          void loadLogins();
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [
      canSubmit,
      fromJson,
      jsonPairs,
      selected,
      targetType,
      targetId,
      projectId,
      emailBase,
      passwordMode,
      sharedPassword,
      scheduleEnabled,
      scheduleValue,
      softwareIds,
      prepareNotice,
      loadLogins,
    ]
  );

  const downloadCsv = useCallback(() => {
    if (!result) return;
    const rows = [
      ['IP', 'VM username', 'Portal email', 'Password', 'Status', 'Error'],
      ...result.rows.map((r) => [
        r.ipAddress ?? '',
        r.username ?? '',
        r.email,
        r.password ?? '',
        r.status,
        r.error ?? '',
      ]),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `server-assign-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  // ── Results view replaces the form ───────────────────────────────────
  if (result) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900">Server Assign</h1>
          <p className="mt-1 text-sm text-gray-500">
            Assigned under project <span className="font-medium">{result.projectName}</span>.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle className="h-4 w-4" />
            {result.summary.assigned} assigned
          </span>
          {result.summary.failed > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
              <XCircle className="h-4 w-4" />
              {result.summary.failed} failed
            </span>
          )}
          <button
            type="button"
            onClick={downloadCsv}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Download the CSV now. Portal passwords are hashed on save and are not shown again.
          </span>
        </div>

        {result.note && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{result.note}</span>
          </div>
        )}

        {installError && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Users were assigned, but the install jobs could not be queued: {installError}
            </span>
          </div>
        )}

        {installResult && (
          <InstallProgressPanel
            result={installResult}
            catalog={catalog}
            isAuthenticated={isAuthenticated}
          />
        )}

        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">VM username</th>
                <th className="px-4 py-3">Portal email</th>
                <th className="px-4 py-3">Password</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.rows.map((r) => (
                <tr key={r.credentialId}>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-900">
                    {r.ipAddress ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{r.username ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{r.email}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                    {r.password ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.status === 'assigned' ? (
                      <span className="text-emerald-700">Assigned</span>
                    ) : (
                      <span className="text-rose-600">{r.error ?? 'Failed'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() => {
            setResult(null);
            setInstallResult(null);
            setInstallError(null);
          }}
          className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
        >
          Run another assignment
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Server Assign</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pick VM logins from the inventory and generate a numbered user series, or upload a file
          that already pairs each login with its user.
        </p>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Installs outlive the page they were started from, so the tracking for
          past batches lives here rather than only on the result screen. */}
      <InstallRunHistory
        catalog={catalog}
        isAuthenticated={isAuthenticated}
        refreshKey={runsKey}
      />

      {/* ── 1. Owner + project ───────────────────────────────────────── */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold text-gray-900">1 · Assign to</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="targetType">
              Owner type
            </label>
            <select
              id="targetType"
              className={inputClass}
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value as 'admin' | 'tenant');
                setTargetId('');
              }}
            >
              <option value="admin">Platform admin</option>
              <option value="tenant">Tenant</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="targetId">
              {targetType === 'admin' ? 'Admin' : 'Tenant'}
            </label>
            <select
              id="targetId"
              className={inputClass}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Select…</option>
              {(targetType === 'admin' ? admins : tenants).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 max-w-md border-t border-gray-100 pt-5">
          {targetId ? (
            <>
              <ProjectSelect
                value={projectId}
                onChange={(id) => {
                  // The project drives the derived series, so any preview it
                  // produced no longer describes what will be created.
                  setProjectId(id);
                  setPreview(null);
                }}
                projects={projectOptions}
                loading={projectsLoading}
                required
                seedFromQuery={false}
                onCreateProject={() => setCreateProjectOpen(true)}
                title="Project"
                helpText="Client start/end dates come from the project."
                emptyTitle="This owner has no active project."
                emptyHint="Create one with a start and end date to continue."
              />
              {undatedCount > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  {undatedCount} project{undatedCount === 1 ? '' : 's'} can&apos;t be selected
                  because {undatedCount === 1 ? 'it has' : 'they have'} no start/end date. Set the
                  dates on the project to use {undatedCount === 1 ? 'it' : 'them'} here.
                </p>
              )}
            </>
          ) : (
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Project *</p>
              <p className="text-xs text-gray-500">
                Pick an owner first, then choose or create a project.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── 2. Login selection ───────────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            2 · Select VM logins
            <span className="ml-2 font-normal text-gray-500">
              {fromJson
                ? `${jsonPairs.length} row${jsonPairs.length === 1 ? '' : 's'} ready from file (max ${MAX_ROWS})`
                : `${selected.length} of ${visibleLogins.length} shown selected (max ${MAX_ROWS})`}
            </span>
          </h2>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
            {(
              [
                ['inventory', 'Pick from inventory'],
                ['json', 'Upload JSON'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setPickMode(mode);
                  setPreview(null);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  pickMode === mode
                    ? 'bg-[#B91C1C] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {fromJson ? (
          <>
            <p className="mt-2 text-xs text-gray-500">
              The file supplies each user&apos;s email and password, so step 5 is skipped. Access
              hours in step 6 still apply.
            </p>
            <JsonAssignUpload onChange={handleJsonChange} disabled={busy} />
          </>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={hideAssigned}
                  onChange={(e) => setHideAssigned(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                />
                Hide already assigned
              </label>
              <select
                className={`${inputClass} w-28`}
                value={vmTypeFilter}
                onChange={(e) => setVmTypeFilter(e.target.value)}
                aria-label="Filter by VM type"
              >
                <option value="">All types</option>
                {vmTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                className={`${inputClass} w-56`}
                value={vmSpecFilter}
                onChange={(e) => setVmSpecFilter(e.target.value)}
                aria-label="Filter by VM spec"
              >
                <option value="">All specs</option>
                {vmSpecOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                className={`${inputClass} w-44`}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter IP or username…"
              />
              {(vmTypeFilter || vmSpecFilter || filter) && (
                <button
                  type="button"
                  onClick={() => {
                    setVmTypeFilter('');
                    setVmSpecFilter('');
                    setFilter('');
                  }}
                  className="whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={selectAllVisible}
                disabled={visibleLogins.length === 0}
                className="whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
              >
                Toggle all shown
              </button>
            </div>

            <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-gray-100">
              {loginsLoading ? (
                <div className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : visibleLogins.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">
                  No inventory logins match. Import VMs and add logins first.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visibleLogins.map((l) => {
                    const idx = selected.indexOf(l.credentialId);
                    return (
                      <li key={l.credentialId}>
                        <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={idx >= 0}
                            onChange={() => toggleLogin(l.credentialId)}
                            className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                          />
                          <Server className="h-4 w-4 shrink-0 text-gray-400" />
                          <span className="font-mono text-sm text-gray-900">{l.ipAddress}</span>
                          <span className="text-sm text-gray-600">{l.username}</span>
                          {l.vmType && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-600">
                              {l.vmType}
                            </span>
                          )}
                          {l.vmSpec && (
                            <span className="truncate text-xs text-gray-400">{l.vmSpec}</span>
                          )}
                          {l.assigned && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                              assigned
                            </span>
                          )}
                          {idx >= 0 && (
                            <span className="ml-auto text-xs font-medium text-[#B91C1C]">
                              #{idx + 1}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── 3. Reset (installs the agent where it is missing) ───────── */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            3 · Reset VMs
            <span className="ml-2 font-normal text-gray-500">optional</span>
          </h2>
          <button
            type="button"
            onClick={() => {
              setPrepareNotice(null);
              setResetOpen(true);
            }}
            disabled={
              selectedVms.serverIds.length === 0 ||
              selectedVms.serverIds.length > MAX_PREPARE_VMS ||
              busy
            }
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            Reset {selectedVms.serverIds.length || ''} VM
            {selectedVms.serverIds.length === 1 ? '' : 's'}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Wipes user-installed software so the batch starts clean. VMs without a running agent get
          one installed first, over WinRM or SSH using their stored login. Runs now, so do it
          before installing anything below.
        </p>
        {selectedVms.serverIds.length > MAX_PREPARE_VMS && (
          <p className="mt-1.5 text-xs text-amber-700">
            {selectedVms.serverIds.length} VMs selected. This takes {MAX_PREPARE_VMS} at a time —
            run it in smaller batches.
          </p>
        )}
      </section>

      {prepareNotice && (
        <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700 ring-1 ring-gray-200">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <span>{prepareNotice}</span>
        </div>
      )}

      {/* ── 4. Software ──────────────────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            4 · Install software
            <span className="ml-2 font-normal text-gray-500">optional</span>
          </h2>
          {softwareIds.length > 0 && (
            <span className="text-xs text-gray-500">
              {softwareIds.length} × {installMachineCount} VM
              {installMachineCount === 1 ? '' : 's'} ={' '}
              <span className="font-medium text-gray-700">
                {softwareIds.length * installMachineCount} job
                {softwareIds.length * installMachineCount === 1 ? '' : 's'}
              </span>
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Queued through the Machine Manager agent once the assignment succeeds. Logins that share
          an IP install once. VMs without the agent are reported and skipped.
        </p>

        {catalogError ? (
          <p className="mt-4 text-xs text-rose-600">{catalogError}</p>
        ) : catalog.length === 0 ? (
          <p className="mt-4 text-xs text-gray-500">No software in the catalog yet.</p>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((s) => {
              const on = softwareIds.includes(s._id);
              return (
                <label
                  key={s._id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                    on ? 'border-[#B91C1C] bg-[#B91C1C]/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleSoftware(s._id)}
                    disabled={busy}
                    className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                  />
                  <Package className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gray-900">{s.name}</span>
                    <span className="block truncate text-[11px] text-gray-500">
                      {[s.version, s.supportedOS.join(', ')].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 5. User series (not used when a file supplies the users) ─── */}
      <section className={fromJson ? `${cardClass} opacity-60` : cardClass}>
        <h2 className="text-sm font-semibold text-gray-900">
          5 · Generate users
          {fromJson && <span className="ml-2 font-normal text-gray-500">skipped</span>}
        </h2>
        {fromJson ? (
          <p className="mt-1 text-xs text-gray-500">
            Emails and passwords come from the uploaded file, one per row.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="emailMode">
                  Email series
                </label>
                <select
                  id="emailMode"
                  className={inputClass}
                  value={emailMode}
                  onChange={(e) => {
                    setEmailMode(e.target.value as 'manual' | 'project');
                    setPreview(null);
                  }}
                >
                  <option value="manual">Type a base address</option>
                  <option value="project">From project — client + start day</option>
                </select>

                {emailMode === 'manual' ? (
                  <input
                    id="emailPrefix"
                    className={`${inputClass} mt-2`}
                    value={emailPrefix}
                    onChange={(e) => {
                      setEmailPrefix(e.target.value);
                      setPreview(null);
                    }}
                    placeholder="labuser@gmail.com"
                  />
                ) : (
                  <div className="mt-2 flex items-center rounded-lg border border-gray-200 bg-white focus-within:border-[#B91C1C] focus-within:ring-2 focus-within:ring-[#B91C1C]/20">
                    <span
                      className="max-w-[50%] shrink-0 truncate rounded-l-lg border-r border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900"
                      title={projectSeriesLocal || undefined}
                    >
                      {projectSeriesLocal ? (
                        <>
                          {projectSeriesLocal}
                          <span className="text-gray-400">1…{selected.length || 'n'}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className="px-2 text-sm text-gray-400">@</span>
                    <input
                      className="min-w-0 flex-1 rounded-r-lg bg-transparent py-2 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                      value={seriesDomain}
                      onChange={(e) => {
                        setSeriesDomain(e.target.value);
                        setPreview(null);
                      }}
                      placeholder="gmail.com"
                      aria-label="Email domain"
                    />
                  </div>
                )}

                <p className="mt-1.5 text-xs text-gray-500">
                  {emailMode === 'project' && !projectSeriesLocal
                    ? projectId
                      ? 'This project has no client name or start date to build from.'
                      : 'Pick a project above to build the series.'
                    : selected.length > 0 && emailValid
                      ? `Creates ${buildSeriesEmail(emailBase, 1)} … ${buildSeriesEmail(emailBase, selected.length)}`
                      : 'Numbering starts at 1, one user per selected login.'}
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="passwordMode">
                  Password
                </label>
                <select
                  id="passwordMode"
                  className={inputClass}
                  value={passwordMode}
                  onChange={(e) => setPasswordMode(e.target.value as 'auto' | 'shared')}
                >
                  <option value="shared">Shared — one password for all</option>
                  <option value="auto">Auto — unique per user</option>
                </select>
                {passwordMode === 'shared' && (
                  <>
                    <input
                      className={`${inputClass} mt-2`}
                      value={sharedPassword}
                      onChange={(e) => setSharedPassword(e.target.value)}
                      placeholder="Password@123"
                    />
                    {sharedPassword.length > 0 && passwordHint && (
                      <p className="mt-1.5 text-xs text-rose-600">{passwordHint}</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {pairs.length > 0 && emailValid && (
              <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-xs font-medium text-gray-700">Pairing preview</p>
                <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                  {pairs.map((p, i) => (
                    <li key={p.login?.credentialId ?? i}>
                      <span className="font-mono">{p.login?.ipAddress}</span> / {p.login?.username}{' '}
                      → {p.email}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── 6. Schedule ──────────────────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">6 · Access schedule</h2>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
            />
            Set hours
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Optional weekly hours applied to every assignment in this batch. The date range comes
          from the project&apos;s start and end dates.
        </p>
        {scheduleEnabled && (
          <div className="mt-4">
            <WeeklyAccessHoursEditor
              value={scheduleValue}
              onChange={setScheduleValue}
              disabled={busy}
              showDateRange={false}
            />
          </div>
        )}
      </section>

      {/* ── Preview result ───────────────────────────────────────────── */}
      {preview && (
        <section className={cardClass}>
          <h2 className="text-sm font-semibold text-gray-900">Preview</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
              {preview.summary.ready} ready
            </span>
            {preview.summary.failed > 0 && (
              <span className="rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-700 ring-1 ring-rose-200">
                {preview.summary.failed} blocked
              </span>
            )}
          </div>
          {preview.summary.failed > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-rose-700">
              {preview.rows
                .filter((r) => r.status === 'failed')
                .slice(0, 10)
                .map((r) => (
                  <li key={r.credentialId}>
                    <span className="font-mono">{r.ipAddress ?? '?'}</span> / {r.username ?? '?'} →{' '}
                    {r.email}: {r.error}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void submit(true)}
          disabled={!canSubmit || busy}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => void submit(false)}
          disabled={!canSubmit || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Assign {rowCount > 0 ? rowCount : ''} login
          {rowCount === 1 ? '' : 's'}
        </button>
      </div>

      {resetOpen && (
        <VmInventoryResetModal
          serverIds={selectedVms.serverIds}
          ipAddresses={selectedVms.ipAddresses}
          onClose={() => setResetOpen(false)}
          onFinished={(message) => {
            setResetOpen(false);
            setPrepareNotice(message);
          }}
        />
      )}

      {targetId && (
        <CreateProjectModal
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          portal={targetType === 'tenant' ? 'tenant' : 'org'}
          owner={{ type: targetType, id: targetId }}
          preselectedServices={INVENTORY_PROJECT_SERVICES}
          lockServices
          onCreated={(project) => {
            setProjectId(project.id);
            void loadProjects();
          }}
        />
      )}
    </div>
  );
}
