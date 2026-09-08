'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Loader2,
  Server,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { WeeklyAccessHoursEditor } from '@/components/access-schedule/WeeklyAccessHoursEditor';
import {
  buildWeeklyAccessSchedule,
  createDefaultWeeklyEditorValue,
  type WeeklyAccessEditorValue,
} from '@/lib/accessSchedule';
import { fetchSuperAdminExternalVmTargets, type SuperAdminTargetOption } from '@/lib/superAdminTargetsApi';
import {
  buildSeriesEmail,
  bulkAssignInventory,
  fetchInventoryProjects,
  fetchVmInventory,
  type BulkAssignResult,
  type InventoryProjectOption,
  type VmInventoryRow,
} from '@/lib/vmInventoryApi';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';
const cardClass = 'rounded-xl border border-gray-100 bg-white p-5';

const MAX_ROWS = 250;

/** One selectable login: an inventory VM plus one of its usernames. */
interface LoginOption {
  credentialId: string;
  ipAddress: string;
  username: string;
  vmSpec: string | null;
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
  // ── Target owner ─────────────────────────────────────────────────────
  const [targetType, setTargetType] = useState<'admin' | 'tenant'>('admin');
  const [targetId, setTargetId] = useState('');
  const [admins, setAdmins] = useState<SuperAdminTargetOption[]>([]);
  const [tenants, setTenants] = useState<SuperAdminTargetOption[]>([]);

  // ── Project ──────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<InventoryProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(false);

  // ── Logins ───────────────────────────────────────────────────────────
  const [logins, setLogins] = useState<LoginOption[]>([]);
  const [loginsLoading, setLoginsLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [hideAssigned, setHideAssigned] = useState(true);

  // ── Series ───────────────────────────────────────────────────────────
  const [emailPrefix, setEmailPrefix] = useState('');
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

  const loadLogins = useCallback(async () => {
    setLoginsLoading(true);
    try {
      // Only inventory-owned rows carry assignable credentials.
      const res = await fetchVmInventory({ source: 'inventory', page: 1, pageSize: 200 });
      const flat: LoginOption[] = [];
      res.rows.forEach((row: VmInventoryRow) => {
        row.credentials.forEach((c) => {
          if (!c.credentialId) return;
          flat.push({
            credentialId: c.credentialId,
            ipAddress: row.ipAddress,
            username: c.username ?? '—',
            vmSpec: row.vmSpec,
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

  // Projects depend on the chosen owner, so reset both together.
  useEffect(() => {
    setProjectId('');
    setProjects([]);
    if (!targetId) return;
    setProjectsLoading(true);
    fetchInventoryProjects(targetType === 'admin' ? { adminId: targetId } : { tenantId: targetId })
      .then(setProjects)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load projects.')
      )
      .finally(() => setProjectsLoading(false));
  }, [targetType, targetId]);

  // ── Derived ──────────────────────────────────────────────────────────
  const visibleLogins = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return logins.filter((l) => {
      if (hideAssigned && l.assigned) return false;
      if (!q) return true;
      return l.ipAddress.toLowerCase().includes(q) || l.username.toLowerCase().includes(q);
    });
  }, [logins, filter, hideAssigned]);

  const loginById = useMemo(
    () => new Map(logins.map((l) => [l.credentialId, l])),
    [logins]
  );

  const passwordHint = passwordMode === 'shared' ? validateSharedPassword(sharedPassword) : null;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPrefix.trim());

  const canSubmit =
    selected.length > 0 &&
    selected.length <= MAX_ROWS &&
    Boolean(targetId) &&
    Boolean(projectId) &&
    emailValid &&
    (passwordMode === 'auto' || (sharedPassword.length > 0 && !passwordHint));

  /** Pairing preview, in the exact order the server will use. */
  const pairs = useMemo(
    () =>
      selected.map((credentialId, i) => ({
        login: loginById.get(credentialId),
        email: buildSeriesEmail(emailPrefix.trim().toLowerCase(), i + 1),
      })),
    [selected, loginById, emailPrefix]
  );

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
          credentialIds: selected,
          targetType,
          targetId,
          projectId,
          emailPrefix: emailPrefix.trim().toLowerCase(),
          passwordMode,
          ...(passwordMode === 'shared' ? { sharedPassword } : {}),
          ...(scheduleEnabled ? { accessSchedule: buildWeeklyAccessSchedule(scheduleValue) } : {}),
          dryRun,
        });
        if (dryRun) {
          setPreview(res);
        } else {
          setResult(res);
          setPreview(null);
          setSelected([]);
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
      selected,
      targetType,
      targetId,
      projectId,
      emailPrefix,
      passwordMode,
      sharedPassword,
      scheduleEnabled,
      scheduleValue,
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
          onClick={() => setResult(null)}
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
          Pick VM logins from the inventory, generate a numbered user series, and grant them in one
          go.
        </p>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── 1. Owner + project ───────────────────────────────────────── */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold text-gray-900">1 · Assign to</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
          <div>
            <label className={labelClass} htmlFor="projectId">
              Project
            </label>
            <select
              id="projectId"
              className={inputClass}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!targetId || projectsLoading}
            >
              <option value="">
                {projectsLoading
                  ? 'Loading…'
                  : !targetId
                    ? 'Pick an owner first'
                    : projects.length === 0
                      ? 'No dated projects'
                      : 'Select…'}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.clientName}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500">
              Client start/end dates come from the project.
            </p>
          </div>
        </div>
        {targetId && !projectsLoading && projects.length === 0 && (
          <p className="mt-3 text-xs text-amber-700">
            This owner has no active project with both a start and end date. Set those on the
            project before assigning.
          </p>
        )}
      </section>

      {/* ── 2. Login selection ───────────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            2 · Select VM logins
            <span className="ml-2 font-normal text-gray-500">
              {selected.length} of {visibleLogins.length} shown selected (max {MAX_ROWS})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={hideAssigned}
                onChange={(e) => setHideAssigned(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
              />
              Hide already assigned
            </label>
            <input
              className={`${inputClass} w-48`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter IP or username…"
            />
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={visibleLogins.length === 0}
              className="whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              Toggle all shown
            </button>
          </div>
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
      </section>

      {/* ── 3. User series ───────────────────────────────────────────── */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold text-gray-900">3 · Generate users</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="emailPrefix">
              Email series
            </label>
            <input
              id="emailPrefix"
              className={inputClass}
              value={emailPrefix}
              onChange={(e) => {
                setEmailPrefix(e.target.value);
                setPreview(null);
              }}
              placeholder="labuser@gmail.com"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              {selected.length > 0 && emailValid
                ? `Creates ${buildSeriesEmail(emailPrefix.trim().toLowerCase(), 1)} … ${buildSeriesEmail(emailPrefix.trim().toLowerCase(), selected.length)}`
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
                  <span className="font-mono">{p.login?.ipAddress}</span> / {p.login?.username} →{' '}
                  {p.email}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── 4. Schedule ──────────────────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">4 · Access schedule</h2>
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
          Optional weekly hours applied to every assignment in this batch.
        </p>
        {scheduleEnabled && (
          <div className="mt-4">
            <WeeklyAccessHoursEditor
              value={scheduleValue}
              onChange={setScheduleValue}
              disabled={busy}
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
          Assign {selected.length > 0 ? selected.length : ''} login
          {selected.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}
