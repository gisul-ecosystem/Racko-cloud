'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Plus,
  Search,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiClient';
import {
  bulkImportSuperAdminExternalVms,
  clientSchedulesOverlap,
  fetchSuperAdminExternalVmAssignees,
  fetchSuperAdminExternalVmTargets,
  type AssignmentScheduleDto,
  type SuperAdminAssigneeOption,
  type SuperAdminBulkImportResult,
  type SuperAdminBulkImportLegacyRowDto,
  type SuperAdminBulkImportRowDto,
  type SuperAdminTargetOption,
} from '@/lib/superAdminExternalVmApi';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

const DAY_LABELS = [
  { d: 0, label: 'Sun' },
  { d: 1, label: 'Mon' },
  { d: 2, label: 'Tue' },
  { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' },
  { d: 6, label: 'Sat' },
];

const BULK_EXAMPLE = `[
  {
    "name": "Finance VM 01",
    "ip": "10.0.0.10",
    "password": "VmPassword123!",
    "protocol": "rdp",
    "username": "Administrator",
    "tenantName": "Acme Corp",
    "user": {
      "name": "Jane Doe",
      "email": "jane@acme.example",
      "username": "jane.doe",
      "password": "PortalPass123!"
    },
    "schedule": {
      "effectiveFrom": "2026-08-01",
      "effectiveTo": null,
      "daysOfWeek": [1, 2, 3, 4, 5],
      "dailyStart": "09:00",
      "dailyEnd": "18:00",
      "timezone": "Asia/Kolkata"
    }
  }
]`;

type TargetMode = 'admin' | 'tenant';

interface EditorAssignment {
  key: string;
  assigneeId: string;
  useSchedule: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  daysOfWeek: number[];
  dailyStart: string;
  dailyEnd: string;
  timezone: string;
}

type ImportShape = 'legacy' | 'extended';

interface EditorRow {
  key: string;
  name: string;
  ip: string;
  password: string;
  protocol: 'rdp' | 'ssh';
  username: string;
  importShape: ImportShape;
  targetMode: TargetMode;
  targetId: string;
  tenantName: string;
  createPortalUser: boolean;
  portalUserName: string;
  portalUserEmail: string;
  portalUserUsername: string;
  portalUserPassword: string;
  rowAssignment: EditorAssignment;
  assignments: EditorAssignment[];
}

interface PickerOption {
  id: string;
  label: string;
  searchText: string;
  meta?: string;
}

function emptyAssignment(): EditorAssignment {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    assigneeId: '',
    useSchedule: false,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    daysOfWeek: [1, 2, 3, 4, 5],
    dailyStart: '09:00',
    dailyEnd: '18:00',
    timezone: 'Asia/Kolkata',
  };
}

function isCompleteScheduleRaw(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const s = raw as Record<string, unknown>;
  const from = s.effectiveFrom;
  if (from == null || from === '') return false;
  const days = s.daysOfWeek;
  if (!Array.isArray(days) || days.length === 0) return false;
  if (typeof s.dailyStart !== 'string' || !s.dailyStart.trim()) return false;
  if (typeof s.dailyEnd !== 'string' || !s.dailyEnd.trim()) return false;
  return true;
}

function normalizeScheduleForPayload(raw: unknown): AssignmentScheduleDto | undefined {
  if (!isCompleteScheduleRaw(raw)) return undefined;
  const s = raw as AssignmentScheduleDto;
  const fromStr = String(s.effectiveFrom).slice(0, 10);
  const toStr = s.effectiveTo ? String(s.effectiveTo).slice(0, 10) : '';
  return {
    effectiveFrom: new Date(`${fromStr}T00:00:00.000Z`).toISOString(),
    effectiveTo: toStr ? new Date(`${toStr}T23:59:59.999Z`).toISOString() : null,
    daysOfWeek: s.daysOfWeek,
    dailyStart: s.dailyStart,
    dailyEnd: s.dailyEnd,
    timezone: s.timezone?.trim() || 'Asia/Kolkata',
  };
}

function emptyRow(defaults?: {
  targetMode?: TargetMode;
  targetId?: string;
  importShape?: ImportShape;
}): EditorRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    ip: '',
    password: '',
    protocol: 'rdp',
    username: '',
    importShape: defaults?.importShape ?? 'legacy',
    targetMode: defaults?.targetMode ?? 'admin',
    targetId: defaults?.targetId ?? '',
    tenantName: '',
    createPortalUser: false,
    portalUserName: '',
    portalUserEmail: '',
    portalUserUsername: '',
    portalUserPassword: '',
    rowAssignment: emptyAssignment(),
    assignments: [],
  };
}

function scheduleFromRaw(raw: Record<string, unknown> | undefined): EditorAssignment {
  const base = emptyAssignment();
  if (!isCompleteScheduleRaw(raw)) return base;
  const schedule = raw as unknown as AssignmentScheduleDto;
  return {
    ...base,
    useSchedule: true,
    effectiveFrom: schedule.effectiveFrom?.slice(0, 10) ?? base.effectiveFrom,
    effectiveTo: schedule.effectiveTo ? schedule.effectiveTo.slice(0, 10) : '',
    daysOfWeek: schedule.daysOfWeek?.length ? schedule.daysOfWeek : base.daysOfWeek,
    dailyStart: schedule.dailyStart ?? base.dailyStart,
    dailyEnd: schedule.dailyEnd ?? base.dailyEnd,
    timezone: schedule.timezone ?? base.timezone,
  };
}

function rowFromRawJson(
  raw: Record<string, unknown>,
  defaults: { targetMode: TargetMode; targetId: string }
): EditorRow {
  const ip = String(raw.ipAddress ?? raw.ip ?? '').trim();
  const tenantName = String(raw.tenantName ?? '').trim();
  const userRaw = raw.user as Record<string, unknown> | undefined;
  const isExtended = Boolean(tenantName);

  if (isExtended) {
    const rowSchedule = scheduleFromRaw(raw.schedule as Record<string, unknown> | undefined);
    return {
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(raw.name ?? '').trim(),
      ip,
      password: String(raw.password ?? ''),
      protocol: raw.protocol === 'ssh' ? 'ssh' : 'rdp',
      username: String(raw.username ?? '').trim(),
      importShape: 'extended',
      targetMode: 'tenant',
      targetId: '',
      tenantName,
      createPortalUser: Boolean(userRaw),
      portalUserName: String(userRaw?.name ?? '').trim(),
      portalUserEmail: String(userRaw?.email ?? '').trim(),
      portalUserUsername: String(userRaw?.username ?? '').trim(),
      portalUserPassword: String(userRaw?.password ?? ''),
      rowAssignment: rowSchedule,
      assignments: [],
    };
  }

  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: String(raw.name ?? '').trim(),
    ip,
    password: String(raw.password ?? ''),
    protocol: raw.protocol === 'ssh' ? 'ssh' : 'rdp',
    username: String(raw.username ?? '').trim(),
    importShape: 'legacy',
    targetMode: defaults.targetMode,
    targetId: defaults.targetId,
    tenantName: '',
    createPortalUser: false,
    portalUserName: '',
    portalUserEmail: '',
    portalUserUsername: '',
    portalUserPassword: '',
    rowAssignment: emptyAssignment(),
    assignments: [],
  };
}

function rowToPayload(
  row: EditorRow,
  defaultMode: TargetMode,
  defaultTargetId: string
): SuperAdminBulkImportRowDto | null {
  if (!row.name.trim() || !row.ip.trim() || !row.password) {
    return null;
  }

  if (row.importShape === 'extended') {
    if (!row.tenantName.trim()) return null;
    if (row.createPortalUser) {
      if (!row.portalUserEmail.trim() || !row.portalUserUsername.trim() || !row.portalUserPassword) {
        return null;
      }
    }
    const schedule = row.createPortalUser ? toScheduleDto(row.rowAssignment) : undefined;
    if (row.rowAssignment.useSchedule && row.createPortalUser && !schedule) {
      return null;
    }
    return {
      name: row.name.trim(),
      ip: row.ip.trim(),
      password: row.password,
      protocol: row.protocol,
      ...(row.username.trim() ? { username: row.username.trim() } : {}),
      tenantName: row.tenantName.trim(),
      ...(row.createPortalUser
        ? {
            user: {
              ...(row.portalUserName.trim() ? { name: row.portalUserName.trim() } : {}),
              email: row.portalUserEmail.trim(),
              username: row.portalUserUsername.trim(),
              password: row.portalUserPassword,
            },
          }
        : {}),
      ...(schedule ? { schedule } : {}),
    };
  }

  const targetId = row.targetId || defaultTargetId;
  if (!targetId) return null;

  const assignments = row.assignments
    .filter((a) => a.assigneeId)
    .map((a) => {
      const schedule = toScheduleDto(a);
      if (row.targetMode === 'tenant') {
        return { tenantUserId: a.assigneeId, ...(schedule ? { schedule } : {}) };
      }
      return { userId: a.assigneeId, ...(schedule ? { schedule } : {}) };
    });

  return {
    name: row.name.trim(),
    ip: row.ip.trim(),
    password: row.password,
    protocol: row.protocol,
    ...(row.username.trim() ? { username: row.username.trim() } : {}),
    target: row.targetMode === 'tenant' ? { tenantId: targetId } : { adminId: targetId },
    ...(assignments.length ? { assignments } : {}),
  };
}

function jsonTextToPayload(
  jsonText: string,
  defaultMode: TargetMode,
  defaultTargetId: string
): SuperAdminBulkImportRowDto[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const vms: SuperAdminBulkImportRowDto[] = [];
  for (const raw of parsed as Array<Record<string, unknown>>) {
    const tenantName = String(raw.tenantName ?? '').trim();
    if (tenantName) {
      const userRaw = raw.user as Record<string, unknown> | undefined;
      const schedule = normalizeScheduleForPayload(raw.schedule);
      if (!raw.name || !(raw.ip ?? raw.ipAddress) || !raw.password) return null;
      if (userRaw) {
        if (!userRaw.email || !userRaw.username || !userRaw.password) return null;
      }
      vms.push({
        name: String(raw.name).trim(),
        ip: String(raw.ipAddress ?? raw.ip).trim(),
        password: String(raw.password),
        protocol: raw.protocol === 'ssh' ? 'ssh' : 'rdp',
        ...(raw.username ? { username: String(raw.username).trim() } : {}),
        tenantName,
        ...(userRaw
          ? {
              user: {
                ...(userRaw.name ? { name: String(userRaw.name).trim() } : {}),
                email: String(userRaw.email).trim(),
                username: String(userRaw.username).trim(),
                password: String(userRaw.password),
              },
            }
          : {}),
        ...(schedule ? { schedule } : {}),
      });
      continue;
    }

    const target = raw.target as
      | { tenantId: string }
      | { adminId: string }
      | { tenantSlug: string }
      | { adminEmail: string }
      | undefined;
    if (target) {
      if (!raw.name || !(raw.ip ?? raw.ipAddress) || !raw.password) return null;
      vms.push({
        name: String(raw.name).trim(),
        ip: String(raw.ipAddress ?? raw.ip).trim(),
        password: String(raw.password),
        protocol: raw.protocol === 'ssh' ? 'ssh' : 'rdp',
        ...(raw.username ? { username: String(raw.username).trim() } : {}),
        target,
        ...(Array.isArray(raw.assignments)
          ? {
              assignments: (raw.assignments as Array<Record<string, unknown>>).map((a) => {
                const sched = normalizeScheduleForPayload(a.schedule);
                const { schedule: _drop, ...rest } = a;
                return sched ? { ...rest, schedule: sched } : rest;
              }),
            }
          : {}),
      });
      continue;
    }

    if (!defaultTargetId) return null;
    if (!raw.name || !(raw.ip ?? raw.ipAddress) || !raw.password) return null;
    vms.push({
      name: String(raw.name).trim(),
      ip: String(raw.ipAddress ?? raw.ip).trim(),
      password: String(raw.password),
      protocol: raw.protocol === 'ssh' ? 'ssh' : 'rdp',
      ...(raw.username ? { username: String(raw.username).trim() } : {}),
      target: defaultMode === 'tenant' ? { tenantId: defaultTargetId } : { adminId: defaultTargetId },
    });
  }
  return vms;
}

function toScheduleDto(a: EditorAssignment): AssignmentScheduleDto | undefined {
  if (!a.useSchedule) return undefined;
  if (!a.effectiveFrom || !a.daysOfWeek.length || !a.dailyStart || !a.dailyEnd) return undefined;
  return {
    effectiveFrom: new Date(`${a.effectiveFrom}T00:00:00.000Z`).toISOString(),
    effectiveTo: a.effectiveTo
      ? new Date(`${a.effectiveTo}T23:59:59.999Z`).toISOString()
      : null,
    daysOfWeek: a.daysOfWeek,
    dailyStart: a.dailyStart,
    dailyEnd: a.dailyEnd,
    timezone: a.timezone || 'Asia/Kolkata',
  };
}

function overlapWarnings(assignments: EditorAssignment[]): string[] {
  const warnings: string[] = [];
  const withSched = assignments
    .map((a, index) => ({ a, index, schedule: toScheduleDto(a) }))
    .filter((x) => x.schedule);

  for (let i = 0; i < withSched.length; i++) {
    for (let j = i + 1; j < withSched.length; j++) {
      const left = withSched[i]!;
      const right = withSched[j]!;
      if (clientSchedulesOverlap(left.schedule!, right.schedule!)) {
        warnings.push(
          `Assignments ${left.index + 1} and ${right.index + 1} have overlapping schedules`
        );
      }
    }
  }
  return warnings;
}

function targetOptionToPicker(option: SuperAdminTargetOption): PickerOption {
  return {
    id: option.id,
    label: option.label,
    meta: option.email ?? option.slug ?? undefined,
    searchText: [
      option.label,
      option.email ?? '',
      option.username ?? '',
      option.name ?? '',
      option.slug ?? '',
    ]
      .join(' ')
      .toLowerCase(),
  };
}

function assigneeOptionToPicker(option: SuperAdminAssigneeOption): PickerOption {
  const label = option.username ? `${option.username} (${option.email})` : option.email;
  return {
    id: option.id,
    label,
    meta: option.email,
    searchText: [option.email, option.username ?? ''].join(' ').toLowerCase(),
  };
}

function SchedulePicker({
  value,
  onChange,
}: {
  value: EditorAssignment;
  onChange: (next: EditorAssignment) => void;
}) {
  const toggleDay = (d: number) => {
    const has = value.daysOfWeek.includes(d);
    onChange({
      ...value,
      daysOfWeek: has
        ? value.daysOfWeek.filter((x) => x !== d)
        : [...value.daysOfWeek, d].sort((a, b) => a - b),
    });
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Effective from</label>
          <input
            type="date"
            className={inputClass}
            value={value.effectiveFrom}
            onChange={(e) => onChange({ ...value, effectiveFrom: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Effective to (optional)</label>
          <input
            type="date"
            className={inputClass}
            value={value.effectiveTo}
            onChange={(e) => onChange({ ...value, effectiveTo: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Daily start</label>
          <input
            type="time"
            className={inputClass}
            value={value.dailyStart}
            onChange={(e) => onChange({ ...value, dailyStart: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Daily end</label>
          <input
            type="time"
            className={inputClass}
            value={value.dailyEnd}
            onChange={(e) => onChange({ ...value, dailyEnd: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Days of week</label>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map(({ d, label }) => {
            const on = value.daysOfWeek.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  on
                    ? 'bg-[#B91C1C] text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className={labelClass}>Timezone</label>
        <input
          className={inputClass}
          value={value.timezone}
          onChange={(e) => onChange({ ...value, timezone: e.target.value })}
          placeholder="Asia/Kolkata"
        />
      </div>
    </div>
  );
}

function FilterableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.searchText.includes(needle));
  }, [options, query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          className={`${inputClass} pl-9`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
        />
      </div>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {filtered.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {filtered.length === 0 && <p className="text-xs text-gray-500">{emptyText}</p>}
    </div>
  );
}

export default function SuperAdminServerImportPage() {
  const { toasts, addToast, dismiss } = useToast();
  const [jsonText, setJsonText] = useState(BULK_EXAMPLE);
  const [rows, setRows] = useState<EditorRow[]>([emptyRow()]);
  const [defaultMode, setDefaultMode] = useState<TargetMode>('admin');
  const [defaultTargetId, setDefaultTargetId] = useState('');
  const [admins, setAdmins] = useState<SuperAdminTargetOption[]>([]);
  const [tenants, setTenants] = useState<SuperAdminTargetOption[]>([]);
  const [assigneesByKey, setAssigneesByKey] = useState<Record<string, SuperAdminAssigneeOption[]>>(
    {}
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SuperAdminBulkImportResult | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchSuperAdminExternalVmTargets();
        setAdmins(data.admins ?? []);
        setTenants(data.tenants ?? []);
      } catch (err) {
        addToast('error', err instanceof ApiError ? err.message : 'Failed to load targets.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAssignees = useCallback(async (rowKey: string, mode: TargetMode, targetId: string) => {
    if (!targetId) {
      setAssigneesByKey((prev) => ({ ...prev, [rowKey]: [] }));
      return;
    }
    try {
      const assignees = await fetchSuperAdminExternalVmAssignees(
        mode === 'admin' ? { adminId: targetId } : { tenantId: targetId }
      );
      setAssigneesByKey((prev) => ({ ...prev, [rowKey]: assignees }));
    } catch {
      setAssigneesByKey((prev) => ({ ...prev, [rowKey]: [] }));
    }
  }, []);

  useEffect(() => {
    for (const row of rows) {
      if (row.targetId) void loadAssignees(row.key, row.targetMode, row.targetId);
    }
    // Only re-fetch when target selection changes, not on every field edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loadAssignees,
    rows.map((r) => `${r.key}:${r.targetMode}:${r.targetId}`).join('|'),
  ]);

  const applyJsonToEditor = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      addToast('error', 'Invalid JSON.');
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      addToast('error', 'JSON must be a non-empty array.');
      return;
    }

    const next: EditorRow[] = [];
    for (const raw of parsed as Array<Record<string, unknown>>) {
      next.push(
        rowFromRawJson(raw, { targetMode: defaultMode, targetId: defaultTargetId })
      );
    }
    setRows(next);
    setResult(null);
    addToast('success', `Loaded ${next.length} row${next.length === 1 ? '' : 's'} into the editor.`);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setJsonText(String(reader.result ?? ''));
      addToast('success', 'File loaded into JSON editor.');
    };
    reader.onerror = () => addToast('error', 'Failed to read file.');
    reader.readAsText(file);
  };

  const buildPayload = (): SuperAdminBulkImportRowDto[] | null => {
    const hasEditorContent = rows.some((r) => r.name.trim() && r.ip.trim());
    if (!hasEditorContent) {
      const fromJson = jsonTextToPayload(jsonText, defaultMode, defaultTargetId);
      if (fromJson?.length) return fromJson;
    }

    const vms: SuperAdminBulkImportRowDto[] = [];
    for (const row of rows) {
      if (!row.name.trim() || !row.ip.trim() || !row.password) {
        addToast('error', 'Each row needs name, IP, and password.');
        return null;
      }

      if (row.importShape === 'extended') {
        if (!row.tenantName.trim()) {
          addToast('error', `Row "${row.name}" needs a tenant name.`);
          return null;
        }
        if (row.createPortalUser) {
          if (!row.portalUserEmail.trim() || !row.portalUserUsername.trim() || !row.portalUserPassword) {
            addToast('error', `Row "${row.name}" portal user needs email, username, and password.`);
            return null;
          }
        }
      } else {
        const targetId = row.targetId || defaultTargetId;
        if (!targetId) {
          addToast('error', `Row "${row.name}" needs a target admin or tenant.`);
          return null;
        }
        const warnings = overlapWarnings(row.assignments);
        if (warnings.length > 0) {
          addToast('error', `${row.name}: ${warnings[0]}`);
          return null;
        }
      }

      const payload = rowToPayload(row, defaultMode, defaultTargetId);
      if (!payload) {
        addToast('error', `Row "${row.name}" could not be built.`);
        return null;
      }
      vms.push(payload);
    }
    return vms;
  };

  const handleSubmit = async () => {
    const vms = buildPayload();
    if (!vms) return;
    setSubmitting(true);
    setResult(null);
    try {
      const data = await bulkImportSuperAdminExternalVms(vms);
      setResult(data);
      addToast(
        data.summary.failed === 0 ? 'success' : 'error',
        data.summary.failed === 0
          ? `Imported ${data.summary.succeeded} server${data.summary.succeeded === 1 ? '' : 's'}.`
          : `Imported ${data.summary.succeeded}/${data.summary.total} with failures.`
      );
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Bulk import failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const targetOptions = useMemo(
    () =>
      defaultMode === 'admin'
        ? admins.map(targetOptionToPicker)
        : tenants.map(targetOptionToPicker),
    [admins, tenants, defaultMode]
  );

  return (
    <div className="mx-auto max-w-5xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <Link
        href="/super-admin-console/elastic-servers"
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" /> Server Import & Assign
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Server Import & Assign</h1>
      <p className="mt-0.5 text-sm text-gray-500">
        Paste server connection fields only, then pick target and assignees in the form.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">1. JSON source</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>Upload .json file</label>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#B91C1C] hover:file:bg-red-100"
            />
          </div>
          <div>
            <label className={labelClass}>JSON array</label>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              rows={12}
              className={`${inputClass} font-mono text-xs leading-relaxed`}
            />
            <p className="mt-1 text-xs text-gray-500">
              Extended rows: VM fields plus `tenantName`, optional `user` (portal login), and
              `schedule`. Legacy rows: VM fields only — pick target/assignees in the form below.
            </p>
          </div>
          <button
            type="button"
            onClick={applyJsonToEditor}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Upload className="h-4 w-4" />
            Load into editor
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">2. Default target</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Applied when a row has no target, and as the default for new rows.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                emptyRow({ targetMode: defaultMode, targetId: defaultTargetId }),
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Stack</label>
            <select
              className={inputClass}
              value={defaultMode}
              onChange={(e) => {
                setDefaultMode(e.target.value as TargetMode);
                setDefaultTargetId('');
              }}
            >
              <option value="admin">Platform admin</option>
              <option value="tenant">Tenant</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{defaultMode === 'admin' ? 'Admin' : 'Tenant'}</label>
            <FilterableSelect
              value={defaultTargetId}
              onChange={setDefaultTargetId}
              options={targetOptions}
              placeholder={`Select ${defaultMode === 'admin' ? 'admin' : 'tenant'}…`}
              searchPlaceholder={`Search ${defaultMode === 'admin' ? 'admin by email/username' : 'tenant by name/slug'}…`}
              emptyText={`No ${defaultMode === 'admin' ? 'admins' : 'tenants'} match your search.`}
            />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {rows.map((row, rowIndex) => {
            const warnings = overlapWarnings(row.assignments);
            const assignees = assigneesByKey[row.key] ?? [];
            const rowTargets =
              row.targetMode === 'admin'
                ? admins.map(targetOptionToPicker)
                : tenants.map(targetOptionToPicker);
            const assigneeOptions = assignees.map(assigneeOptionToPicker);

            return (
              <div key={row.key} className="rounded-xl border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Row {rowIndex + 1}</p>
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input
                      className={inputClass}
                      value={row.name}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r))
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>IP</label>
                    <input
                      className={inputClass}
                      value={row.ip}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, ip: e.target.value } : r))
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Password</label>
                    <input
                      type="password"
                      className={inputClass}
                      value={row.password}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, password: e.target.value } : r
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Protocol</label>
                    <select
                      className={inputClass}
                      value={row.protocol}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, protocol: e.target.value as 'rdp' | 'ssh' }
                              : r
                          )
                        )
                      }
                    >
                      <option value="rdp">RDP</option>
                      <option value="ssh">SSH</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Username (optional)</label>
                    <input
                      className={inputClass}
                      value={row.username}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, username: e.target.value } : r
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Import mode</label>
                    <select
                      className={inputClass}
                      value={row.importShape}
                      onChange={(e) => {
                        const importShape = e.target.value as ImportShape;
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? {
                                  ...r,
                                  importShape,
                                  targetId: importShape === 'extended' ? '' : r.targetId,
                                  assignments: importShape === 'extended' ? [] : r.assignments,
                                }
                              : r
                          )
                        );
                      }}
                    >
                      <option value="legacy">Legacy (form target + assignees)</option>
                      <option value="extended">Extended (tenantName + create user)</option>
                    </select>
                  </div>
                  {row.importShape === 'extended' ? (
                    <>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>Tenant name</label>
                        <input
                          className={inputClass}
                          value={row.tenantName}
                          placeholder="Acme Corp (matches name or slug)"
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r) =>
                                r.key === row.key ? { ...r, tenantName: e.target.value } : r
                              )
                            )
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={row.createPortalUser}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.key === row.key
                                    ? { ...r, createPortalUser: e.target.checked }
                                    : r
                                )
                              )
                            }
                          />
                          Create / assign portal user
                        </label>
                      </div>
                      {row.createPortalUser && (
                        <>
                          <div>
                            <label className={labelClass}>Portal user display name (optional)</label>
                            <input
                              className={inputClass}
                              value={row.portalUserName}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r) =>
                                    r.key === row.key
                                      ? { ...r, portalUserName: e.target.value }
                                      : r
                                  )
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Portal email</label>
                            <input
                              className={inputClass}
                              value={row.portalUserEmail}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r) =>
                                    r.key === row.key
                                      ? { ...r, portalUserEmail: e.target.value }
                                      : r
                                  )
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Portal username</label>
                            <input
                              className={inputClass}
                              value={row.portalUserUsername}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r) =>
                                    r.key === row.key
                                      ? { ...r, portalUserUsername: e.target.value }
                                      : r
                                  )
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Portal password</label>
                            <input
                              type="password"
                              className={inputClass}
                              value={row.portalUserPassword}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r) =>
                                    r.key === row.key
                                      ? { ...r, portalUserPassword: e.target.value }
                                      : r
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={row.rowAssignment.useSchedule}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    prev.map((r) =>
                                      r.key === row.key
                                        ? {
                                            ...r,
                                            rowAssignment: {
                                              ...r.rowAssignment,
                                              useSchedule: e.target.checked,
                                            },
                                          }
                                        : r
                                    )
                                  )
                                }
                              />
                              Optional access schedule
                            </label>
                            {row.rowAssignment.useSchedule && (
                              <SchedulePicker
                                value={row.rowAssignment}
                                onChange={(next) =>
                                  setRows((prev) =>
                                    prev.map((r) =>
                                      r.key === row.key ? { ...r, rowAssignment: next } : r
                                    )
                                  )
                                }
                              />
                            )}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                  <div>
                    <label className={labelClass}>Target stack</label>
                    <select
                      className={inputClass}
                      value={row.targetMode}
                      onChange={(e) => {
                        const mode = e.target.value as TargetMode;
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, targetMode: mode, targetId: '', assignments: [] }
                              : r
                          )
                        );
                      }}
                    >
                      <option value="admin">Platform admin</option>
                      <option value="tenant">Tenant</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      {row.targetMode === 'admin' ? 'Admin' : 'Tenant'}
                    </label>
                    <FilterableSelect
                      value={row.targetId}
                      onChange={(targetId) => {
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, targetId, assignments: [] } : r
                          )
                        );
                        void loadAssignees(row.key, row.targetMode, targetId);
                      }}
                      options={rowTargets}
                      placeholder={`Select ${row.targetMode === 'admin' ? 'admin' : 'tenant'}…`}
                      searchPlaceholder={`Search ${row.targetMode === 'admin' ? 'admin by email/username' : 'tenant by name/slug'}…`}
                      emptyText={`No ${row.targetMode === 'admin' ? 'admins' : 'tenants'} match your search.`}
                    />
                  </div>
                    </>
                  )}
                </div>

                {row.importShape === 'legacy' && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">Assignments</p>
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, assignments: [...r.assignments, emptyAssignment()] }
                              : r
                          )
                        )
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#B91C1C] hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add assignment
                    </button>
                  </div>

                  {warnings.length > 0 && (
                    <div className="mb-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div className="space-y-0.5">
                        {warnings.map((w) => (
                          <p key={w}>{w}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {row.assignments.map((asg, asgIndex) => (
                      <div key={asg.key} className="rounded-lg border border-gray-100 p-3">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <label className={labelClass}>
                              {row.targetMode === 'admin' ? 'Managed user' : 'Tenant user'}
                            </label>
                            <FilterableSelect
                              value={asg.assigneeId}
                              onChange={(assigneeId) =>
                                setRows((prev) =>
                                  prev.map((r) =>
                                    r.key !== row.key
                                      ? r
                                      : {
                                          ...r,
                                          assignments: r.assignments.map((a) =>
                                            a.key === asg.key ? { ...a, assigneeId } : a
                                          ),
                                        }
                                  )
                                )
                              }
                              options={assigneeOptions}
                              placeholder={`Select ${row.targetMode === 'admin' ? 'managed user' : 'tenant user'}…`}
                              searchPlaceholder={`Search ${row.targetMode === 'admin' ? 'user by username/email' : 'tenant user by username/email'}…`}
                              emptyText="No assignees match your search."
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.key !== row.key
                                    ? r
                                    : {
                                        ...r,
                                        assignments: r.assignments.filter((a) => a.key !== asg.key),
                                      }
                                )
                              )
                            }
                            className="mt-7 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={asg.useSchedule}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.key !== row.key
                                    ? r
                                    : {
                                        ...r,
                                        assignments: r.assignments.map((a) =>
                                          a.key === asg.key
                                            ? { ...a, useSchedule: e.target.checked }
                                            : a
                                        ),
                                      }
                                )
                              )
                            }
                          />
                          Optional access schedule (assignment {asgIndex + 1})
                        </label>

                        {asg.useSchedule && (
                          <SchedulePicker
                            value={asg}
                            onChange={(next) =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.key !== row.key
                                    ? r
                                    : {
                                        ...r,
                                        assignments: r.assignments.map((a) =>
                                          a.key === asg.key ? next : a
                                        ),
                                      }
                                )
                              )
                            }
                          />
                        )}
                      </div>
                    ))}
                    {row.assignments.length === 0 && (
                      <p className="text-xs text-gray-400">No assignments — VM will be imported unassigned.</p>
                    )}
                  </div>
                </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-5">
          <Link
            href="/super-admin-console/elastic-servers"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={submitting || rows.length === 0}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            Import & assign
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Results</h2>
          <p className="mt-1 text-xs text-gray-500">
            {result.summary.succeeded} succeeded · {result.summary.failed} failed ·{' '}
            {result.summary.total} total
          </p>
          <ul className="mt-4 space-y-2">
            {result.results.map((r) => (
              <li
                key={r.index}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  r.success
                    ? 'border-green-200 bg-green-50 text-green-900'
                    : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                <div className="flex items-start gap-2">
                  {r.success ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">
                      #{r.index + 1} {r.name ?? '—'} {r.ipAddress ? `(${r.ipAddress})` : ''}
                    </p>
                    {r.error && <p className="text-xs">{r.error}</p>}
                    {r.tenantName && (
                      <p className="text-xs opacity-90">Tenant: {r.tenantName}</p>
                    )}
                    {r.userId && (
                      <p className="text-xs opacity-90">
                        User: {r.userId}
                        {r.userCreated ? ' (created)' : r.userReused ? ' (reused)' : ''}
                      </p>
                    )}
                    {r.externalVmId && (
                      <p className="text-xs opacity-80">VM: {r.externalVmId}</p>
                    )}
                    {r.assignmentId && (
                      <p className="text-xs opacity-80">Assignment: {r.assignmentId}</p>
                    )}
                    {r.assignments?.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {r.assignments.map((a) => (
                          <li key={a.index}>
                            Assignment {a.index + 1}:{' '}
                            {a.success ? 'ok' : a.error ?? 'failed'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
