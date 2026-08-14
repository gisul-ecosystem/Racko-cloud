'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
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
import { fetchProjectsForAdmin, fetchProjectsForTenant, createProjectForAdmin, createProjectForTenant, previewProjectNameForAdmin, previewProjectNameForTenant, type OrgProject } from '@/lib/projectsApi';

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
  defaults: { targetMode: TargetMode; targetId: string },
  options: {
    admins: SuperAdminTargetOption[];
    tenants: SuperAdminTargetOption[];
  }
): EditorRow {
  const ip = String(raw.ipAddress ?? raw.ip ?? '').trim();
  const tenantName = String(raw.tenantName ?? '').trim();
  const adminEmail = String(raw.adminEmail ?? '').trim().toLowerCase();
  const target = raw.target as
    | { tenantId?: string; adminId?: string; tenantSlug?: string; adminEmail?: string }
    | undefined;
  const userRaw = raw.user as Record<string, unknown> | undefined;
  const rowSchedule = scheduleFromRaw(raw.schedule as Record<string, unknown> | undefined);
  const isExtended = Boolean(
    tenantName ||
      adminEmail ||
      userRaw ||
      raw.schedule ||
      (target && (target.tenantId || target.adminId || target.tenantSlug || target.adminEmail))
  );

  if (isExtended) {
    let targetMode: TargetMode = defaults.targetMode;
    let targetId = defaults.targetId;

    const adminIdentifier = String(target?.adminId ?? target?.adminEmail ?? '').trim().toLowerCase();
    if (adminEmail || adminIdentifier) {
      targetMode = 'admin';
      const foundAdmin = options.admins.find(
        (a) =>
          a.id === adminIdentifier ||
          String(a.email ?? '').trim().toLowerCase() === adminEmail ||
          String(a.email ?? '').trim().toLowerCase() === adminIdentifier
      );
      targetId = foundAdmin?.id ?? '';
    } else if (tenantName || target?.tenantId || target?.tenantSlug) {
      targetMode = 'tenant';
      const tenantIdentifier = String(target?.tenantId ?? target?.tenantSlug ?? '').trim().toLowerCase();
      const foundTenant = options.tenants.find(
        (t) =>
          t.id === tenantIdentifier ||
          String(t.slug ?? '').trim().toLowerCase() === tenantIdentifier ||
          String(t.name ?? '').trim().toLowerCase() === tenantName.toLowerCase() ||
          String(t.label ?? '').trim().toLowerCase() === tenantName.toLowerCase()
      );
      targetId = foundTenant?.id ?? '';
    }

    return {
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(raw.name ?? '').trim(),
      ip,
      password: String(raw.password ?? ''),
      protocol: raw.protocol === 'ssh' ? 'ssh' : 'rdp',
      username: String(raw.username ?? '').trim(),
      importShape: 'extended',
      targetMode,
      targetId,
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
  defaultTargetId: string,
  options: {
    admins: SuperAdminTargetOption[];
    tenants: SuperAdminTargetOption[];
  }
): SuperAdminBulkImportRowDto | null {
  if (!row.name.trim() || !row.ip.trim() || !row.password) {
    return null;
  }

  if (row.importShape === 'extended') {
    const targetId = row.targetId || (row.targetMode === defaultMode ? defaultTargetId : '');
    if (!targetId) return null;

    const tenant = row.targetMode === 'tenant' ? options.tenants.find((t) => t.id === targetId) : null;
    const admin = row.targetMode === 'admin' ? options.admins.find((a) => a.id === targetId) : null;
    const tenantName = String(tenant?.name ?? tenant?.label ?? '').trim();
    const adminEmail = String(admin?.email ?? '').trim().toLowerCase();

    if (row.targetMode === 'tenant' && !tenantName) return null;
    if (row.targetMode === 'admin' && !adminEmail) return null;

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
      ...(row.targetMode === 'tenant' ? { tenantName } : { adminEmail }),
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
  defaultTargetId: string,
  options: {
    admins: SuperAdminTargetOption[];
    tenants: SuperAdminTargetOption[];
  }
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
    const adminEmailFromRow = String(raw.adminEmail ?? '').trim().toLowerCase();
    const userRaw = raw.user as Record<string, unknown> | undefined;
    const schedule = normalizeScheduleForPayload(raw.schedule);

    const target = raw.target as
      | { tenantId: string }
      | { adminId: string }
      | { tenantSlug: string }
      | { adminEmail: string }
      | undefined;

    const hasInlineUser = Boolean(userRaw || schedule);
    if (tenantName || adminEmailFromRow || (target && hasInlineUser)) {
      let extendedTenantName = tenantName;
      let extendedAdminEmail = adminEmailFromRow;

      if (!extendedTenantName && !extendedAdminEmail && target) {
        if ('adminEmail' in target && target.adminEmail) {
          extendedAdminEmail = String(target.adminEmail).trim().toLowerCase();
        } else if ('adminId' in target && target.adminId) {
          const foundAdmin = options.admins.find((a) => a.id === String(target.adminId));
          extendedAdminEmail = String(foundAdmin?.email ?? '').trim().toLowerCase();
        } else if ('tenantSlug' in target && target.tenantSlug) {
          const slug = String(target.tenantSlug).trim().toLowerCase();
          const foundTenant = options.tenants.find(
            (t) => String(t.slug ?? '').trim().toLowerCase() === slug
          );
          extendedTenantName = String(foundTenant?.name ?? foundTenant?.label ?? slug).trim();
        } else if ('tenantId' in target && target.tenantId) {
          const foundTenant = options.tenants.find((t) => t.id === String(target.tenantId));
          extendedTenantName = String(foundTenant?.name ?? foundTenant?.label ?? '').trim();
        }
      }

      if (!extendedTenantName && !extendedAdminEmail && hasInlineUser && defaultTargetId) {
        if (defaultMode === 'tenant') {
          const foundTenant = options.tenants.find((t) => t.id === defaultTargetId);
          extendedTenantName = String(foundTenant?.name ?? foundTenant?.label ?? '').trim();
        } else {
          const foundAdmin = options.admins.find((a) => a.id === defaultTargetId);
          extendedAdminEmail = String(foundAdmin?.email ?? '').trim().toLowerCase();
        }
      }

      if (!raw.name || !(raw.ip ?? raw.ipAddress) || !raw.password) return null;
      if (!extendedTenantName && !extendedAdminEmail) return null;
      if (userRaw) {
        if (!userRaw.email || !userRaw.username || !userRaw.password) return null;
      }

      vms.push({
        name: String(raw.name).trim(),
        ip: String(raw.ipAddress ?? raw.ip).trim(),
        password: String(raw.password),
        protocol: raw.protocol === 'ssh' ? 'ssh' : 'rdp',
        ...(raw.username ? { username: String(raw.username).trim() } : {}),
        ...(extendedTenantName ? { tenantName: extendedTenantName } : { adminEmail: extendedAdminEmail }),
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
  const [defaultProjectId, setDefaultProjectId] = useState('');
  const [defaultProjects, setDefaultProjects] = useState<OrgProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [cpPreviewName, setCpPreviewName] = useState('');
  const [cpName, setCpName] = useState('');
  const [cpClientName, setCpClientName] = useState('');
  const [cpDescription, setCpDescription] = useState('');
  const [cpStartDate, setCpStartDate] = useState('');
  const [cpEndDate, setCpEndDate] = useState('');
  const [cpSaving, setCpSaving] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);
  const [admins, setAdmins] = useState<SuperAdminTargetOption[]>([]);
  const [tenants, setTenants] = useState<SuperAdminTargetOption[]>([]);
  const [assigneesByKey, setAssigneesByKey] = useState<Record<string, SuperAdminAssigneeOption[]>>(
    {}
  );
  const [submitting, setSubmitting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SuperAdminBulkImportResult | null>(null);

  // Load projects whenever the selected admin/tenant changes
  useEffect(() => {
    setDefaultProjectId('');
    setDefaultProjects([]);
    if (!defaultTargetId) return;
    let cancelled = false;
    setProjectsLoading(true);
    (async () => {
      try {
        const list =
          defaultMode === 'admin'
            ? await fetchProjectsForAdmin(defaultTargetId)
            : await fetchProjectsForTenant(defaultTargetId);
        if (!cancelled) setDefaultProjects(list.filter((p) => p.status === 'active'));
      } catch {
        if (!cancelled) setDefaultProjects([]);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [defaultTargetId, defaultMode]);

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
        rowFromRawJson(
          raw,
          { targetMode: defaultMode, targetId: defaultTargetId },
          { admins, tenants }
        )
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
      const fromJson = jsonTextToPayload(jsonText, defaultMode, defaultTargetId, {
        admins,
        tenants,
      });
      if (fromJson?.length) return fromJson;
    }

    const vms: SuperAdminBulkImportRowDto[] = [];
    for (const row of rows) {
      if (!row.name.trim() || !row.ip.trim() || !row.password) {
        addToast('error', 'Each row needs name, IP, and password.');
        return null;
      }

      if (row.importShape === 'extended') {
        const resolvedTargetId = row.targetId || (row.targetMode === defaultMode ? defaultTargetId : '');
        if (!resolvedTargetId) {
          addToast('error', `Row "${row.name}" needs a target admin or tenant.`);
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

      const payload = rowToDefaultPayload(row);
      if (!payload) {
        addToast('error', `Row "${row.name}" could not be built. Check selected target/admin details.`);
        return null;
      }
      vms.push(payload);
    }
    return vms;
  };

  async function openCreateProject() {
    setCpClientName('');
    setCpDescription('');
    setCpStartDate('');
    setCpEndDate('');
    setCpError(null);
    setCpPreviewName('');
    setCpName('');
    setCreateProjectOpen(true);
    try {
      const preview =
        defaultMode === 'admin'
          ? await previewProjectNameForAdmin(defaultTargetId)
          : await previewProjectNameForTenant(defaultTargetId);
      setCpPreviewName(preview.name);
      setCpName(preview.name);
    } catch {
      // preview is optional — user can still type a name
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!cpClientName.trim() || !cpStartDate || !cpEndDate) return;
    setCpSaving(true);
    setCpError(null);
    try {
      const input = {
        clientName: cpClientName.trim(),
        name: cpName.trim() !== cpPreviewName ? cpName.trim() : undefined,
        description: cpDescription.trim() || undefined,
        startDate: cpStartDate,
        endDate: cpEndDate,
        enabledServices: ['elastic-servers' as const],
      };
      const created =
        defaultMode === 'admin'
          ? await createProjectForAdmin(defaultTargetId, input)
          : await createProjectForTenant(defaultTargetId, input);
      setDefaultProjects((prev) => [created, ...prev]);
      setDefaultProjectId(created.id);
      setCreateProjectOpen(false);
      addToast('success', `Project "${created.name}" created.`);
    } catch (err) {
      setCpError(err instanceof ApiError ? err.message : 'Failed to create project.');
    } finally {
      setCpSaving(false);
    }
  }

  const handleSubmit = async () => {
    if (defaultTargetId && !defaultProjectId) {
      addToast('error', 'Select a project before importing.');
      return;
    }
    const vms = buildPayload();
    if (!vms) return;

    const CHUNK = 15;
    const total = vms.length;

    setSubmitting(true);
    setImportProgress({ done: 0, total });
    setResult(null);

    const allResults: SuperAdminBulkImportResult['results'] = [];
    let succeeded = 0;
    let failed = 0;

    try {
      for (let i = 0; i < vms.length; i += CHUNK) {
        const chunk = vms.slice(i, i + CHUNK);
        // Re-index results so index reflects position in the original vms array.
        const offset = i;
        try {
          const data = await bulkImportSuperAdminExternalVms(chunk);
          for (const r of data.results) {
            allResults.push({ ...r, index: offset + r.index });
          }
          succeeded += data.summary.succeeded;
          failed += data.summary.failed;
        } catch (err) {
          // Chunk call failed — record every row in the chunk as failed.
          for (let j = 0; j < chunk.length; j++) {
            const row = chunk[j]!;
            allResults.push({
              index: offset + j,
              success: false,
              name: 'name' in row ? String(row.name) : undefined,
              error: err instanceof ApiError ? err.message : 'Request failed',
              assignments: [],
            });
            failed++;
          }
        }
        setImportProgress({ done: Math.min(i + CHUNK, total), total });
      }

      const summary = { total, succeeded, failed };
      setResult({ results: allResults, summary });

      if (failed === 0) {
        setRows([emptyRow({ targetMode: defaultMode, targetId: defaultTargetId })]);
      setAssigneesByKey({});
      }

      addToast(
        failed === 0 ? 'success' : 'error',
        failed === 0
          ? `Imported ${succeeded} server${succeeded === 1 ? '' : 's'}.`
          : `Imported ${succeeded}/${total} with failures.`
      );
    } finally {
      setSubmitting(false);
      setImportProgress(null);
    }
  };

  function rowToDefaultPayload(row: EditorRow): SuperAdminBulkImportRowDto | null {
    const base = rowToPayload(row, defaultMode, defaultTargetId, { admins, tenants });
    if (!base) return null;
    if (defaultProjectId) (base as SuperAdminBulkImportLegacyRowDto).projectId = defaultProjectId;
    return base;
  }

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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Default stack</label>
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
                onChange={(v) => { setDefaultTargetId(v); setDefaultProjectId(''); }}
                options={targetOptions}
                placeholder={`Select ${defaultMode === 'admin' ? 'admin' : 'tenant'}…`}
                searchPlaceholder={`Search ${defaultMode === 'admin' ? 'admin by email/username' : 'tenant by name/slug'}…`}
                emptyText={`No ${defaultMode === 'admin' ? 'admins' : 'tenants'} match your search.`}
              />
            </div>
          </div>

          {/* Project selector — appears after admin/tenant is chosen */}
          {defaultTargetId && (
            <div>
              <label className={labelClass}>Project <span className="text-red-500">*</span></label>
              {projectsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading projects…
                </div>
              ) : defaultProjects.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No active projects for this {defaultMode === 'admin' ? 'admin' : 'tenant'}.{' '}
                  <button
                    type="button"
                    onClick={openCreateProject}
                    className="font-semibold underline"
                  >
                    Create a project
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <select
                    className={inputClass}
                    value={defaultProjectId}
                    onChange={(e) => setDefaultProjectId(e.target.value)}
                  >
                    <option value="">-- Select a project --</option>
                    {defaultProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.clientName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={openCreateProject}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#B91C1C] hover:underline"
                  >
                    + Create new project
                  </button>
                </div>
              )}
            </div>
          )}
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
            <h2 className="text-sm font-semibold text-gray-900">2. Rows & assignments</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Review imported rows and configure row-level targets/assignments if needed.
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
                      <option value="extended">Extended (target + create user)</option>
                    </select>
                  </div>
                  {row.importShape === 'extended' ? (
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
                                  ? { ...r, targetMode: mode, targetId: '' }
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
                          onChange={(targetId) =>
                            setRows((prev) =>
                              prev.map((r) => (r.key === row.key ? { ...r, targetId } : r))
                            )
                          }
                          options={rowTargets}
                          placeholder={`Select ${row.targetMode === 'admin' ? 'admin' : 'tenant'}…`}
                          searchPlaceholder={`Search ${row.targetMode === 'admin' ? 'admin by email/username' : 'tenant by name/slug'}…`}
                          emptyText={`No ${row.targetMode === 'admin' ? 'admins' : 'tenants'} match your search.`}
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
            disabled={submitting || rows.length === 0 || (!!defaultTargetId && !defaultProjectId)}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {importProgress
                  ? `Importing ${importProgress.done} of ${importProgress.total}…`
                  : 'Importing…'}
              </>
            ) : (
              'Import & assign'
            )}
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

          {result.summary.failed > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
                Failed rows
              </p>
              <div className="overflow-hidden rounded-lg border border-red-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-red-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">VM</th>
                      <th className="px-3 py-2 font-semibold">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {result.results
                      .filter((r) => !r.success)
                      .map((r) => (
                        <tr key={r.index} className="align-top">
                          <td className="px-3 py-2 text-gray-400">{r.index + 1}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900">{r.name ?? '—'}</p>
                            {r.ipAddress && (
                              <p className="text-gray-400">{r.ipAddress}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-red-700">
                            <p>{r.error ?? 'Unknown error'}</p>
                            {r.assignments
                              .filter((a) => !a.success)
                              .map((a) => (
                                <p key={a.index} className="mt-0.5 text-gray-500">
                                  Assignment {a.index + 1}: {a.error ?? 'failed'}
                                </p>
                              ))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.summary.succeeded > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
                Succeeded ({result.summary.succeeded})
              </p>
              <ul className="space-y-1">
                {result.results
                  .filter((r) => r.success)
                  .map((r) => (
                    <li
                      key={r.index}
                      className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-900"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        #{r.index + 1} {r.name ?? '—'}
                        {r.tenantName ? ` · ${r.tenantName}` : ''}
                        {r.userCreated
                          ? ' · user created'
                          : r.userReused
                            ? ' · user reused'
                            : ''}
                        {r.assignments.filter((a) => !a.success).length > 0
                          ? ` · ${r.assignments.filter((a) => !a.success).length} assignment(s) failed`
                          : ''}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Create project modal ─────────────────────────────────── */}
      {createProjectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !cpSaving) setCreateProjectOpen(false); }}
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
                  Create Project
                </p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">Create New Project</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Set up a new project to organize and manage your cloud resources.
                </p>
              </div>
              <button
                type="button"
                disabled={cpSaving}
                onClick={() => setCreateProjectOpen(false)}
                aria-label="Close"
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateProject(e)}>
              <div className="space-y-4 p-5">
                {cpError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cpError}</div>
                )}

                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">Project Information</h3>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                        Project Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
                        value={cpName}
                        onChange={(e) => setCpName(e.target.value)}
                        required
                        placeholder={cpPreviewName || 'Auto-generated'}
                      />
                      <p className="mt-1 text-[11px] text-gray-400">A unique name to identify your project.</p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                        Client Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
                        value={cpClientName}
                        onChange={(e) => setCpClientName(e.target.value)}
                        required
                        placeholder="e.g. Acme Corp"
                      />
                      <p className="mt-1 text-[11px] text-gray-400">The client this project belongs to.</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="block text-xs font-semibold text-gray-700">
                        Description <span className="font-normal text-gray-400">(Optional)</span>
                      </label>
                      <span className="text-[11px] text-gray-400">{cpDescription.length} / 500</span>
                    </div>
                    <textarea
                      className="mt-1.5 w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
                      rows={3}
                      value={cpDescription}
                      onChange={(e) => setCpDescription(e.target.value.slice(0, 500))}
                      placeholder="Describe the purpose and workloads for this project."
                    />
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                        Start Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
                        value={cpStartDate}
                        onChange={(e) => setCpStartDate(e.target.value)}
                        max={cpEndDate || undefined}
                        required
                      />
                      <p className="mt-1 text-[11px] text-gray-400">When does this project start?</p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                        End Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
                        value={cpEndDate}
                        onChange={(e) => setCpEndDate(e.target.value)}
                        min={cpStartDate || undefined}
                        required
                      />
                      <p className="mt-1 text-[11px] text-gray-400">When does this project end?</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                <button
                  type="button"
                  disabled={cpSaving}
                  onClick={() => setCreateProjectOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cpSaving || !cpClientName.trim() || !cpStartDate || !cpEndDate}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-60"
                >
                  {cpSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
