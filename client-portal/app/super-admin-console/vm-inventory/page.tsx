'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Database, Lock, LockOpen, Pencil, RotateCcw, Search, Shield, Trash2, Upload } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchSuperAdminVmInventory,
  freeSuperAdminVmInventoryAndDeleteUser,
  importVmProviderMetadata,
  superAdminResetMachinesByInventory,
  superAdminIssueResetStreamTicket,
  superAdminOpenResetStatusStreamWithReconnect,
  type InventoryOwnerScope,
  type InventoryResourceType,
  type InventoryStatus,
  type SuperAdminVmInventoryItem,
  type SuperAdminVmInventoryOwnerOption,
  type VmProviderMetadataImportRow,
} from '@/lib/superAdminVmInventoryApi';
import {
  bulkDeleteSuperAdminExternalVms,
  bulkUpdateSuperAdminExternalVmOverride,
  deleteSuperAdminExternalVm,
  fetchSuperAdminExternalVmOverview,
  setSuperAdminExternalVmInventoryLock,
  type SuperAdminExternalVmOverviewRow,
} from '@/lib/superAdminExternalVmApi';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { ManageExternalVmAssignmentsModal } from '@/components/super-admin-console/ManageExternalVmAssignmentsModal';
import {
  GrantAccessOverrideModal,
  type AccessOverridePayload,
} from '@/components/access-schedule/GrantAccessOverrideModal';
import { ResetProgressModal, type ResetMachineStatus } from './ResetProgressModal';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

type ServiceKey = '' | 'vm-management' | 'create-vm' | 'external-vm';
type SortBy = 'createdAt' | 'owner' | 'service';
type SortDirection = 'asc' | 'desc';
type AssignmentSortBy = 'providerEndDate' | 'clientEndDate' | 'assignedUser' | 'locked';
type FlashMessage = { type: 'success' | 'error' | 'warning'; text: string } | null;

type AssignmentEntry = {
  username: string;
  isTenantUser: boolean;
  ownerKey?: string;
  tenantName?: string;
  planDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly' | null;
  vmSpec?: string | null;
  vmUsername?: string | null;
  vmPassword?: string | null;
  providerStartDate?: string | null;
  providerEndDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type AssignmentRow = {
  rowKey: string;
  ipAddress: string;
  vmNames: string[];
  vmSpecs: string[];
  projectNames: string[];
  clientNames: string[];
  assignments: AssignmentEntry[];
  vmLogins: Array<{
    externalVmId: string;
    name: string;
    vmUsername: string | null;
    vmPassword: string | null;
  }>;
  editableExternalVmId?: string;
  inventoryLocked?: boolean;
  providerDetails?: AssignmentEntry;
};

type ConfirmDialogState =
  | {
      kind: 'freeVmAndDeleteUser';
      item: SuperAdminVmInventoryItem;
      vmLabel: string;
      message: string;
    }
  | {
      kind: 'deleteAssignmentVm';
      row: AssignmentRow;
      vmLabel: string;
      message: string;
    }
  | {
      kind: 'bulkFreeVmAndDeleteUser';
      inventoryIds: string[];
      message: string;
    }
  | {
      kind: 'bulkDeleteAssignmentVms';
      externalVmIds: string[];
      message: string;
    }
  | {
      kind: 'resetMachine';
      item: SuperAdminVmInventoryItem;
      vmLabel: string;
      message: string;
    }
  | {
      kind: 'bulkResetMachines';
      inventoryIds: string[];
      message: string;
    }
  | null;

function OwnerChip({ scope, ownerEmail }: { scope: InventoryOwnerScope; ownerEmail?: string }) {
  const tone =
    scope === 'tenant'
      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
      : 'border-sky-200 bg-sky-50 text-sky-700';

  const normalizedEmail = ownerEmail?.trim().toLowerCase() ?? '';
  const isSuperAdminAccount = normalizedEmail === 'superadmin@yourdomain.com';
  const label = scope === 'tenant' ? 'tenant' : isSuperAdminAccount ? 'superadmin' : 'admin';

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function hasInventoryAssignee(item: SuperAdminVmInventoryItem): boolean {
  return (
    item.mappedAssignments.length > 0 ||
    item.mappedUsers.length > 0 ||
    Boolean(item.mappedTenantUserId || item.mappedTenantUserEmail)
  );
}

function hasKnownInventoryOwner(item: SuperAdminVmInventoryItem): boolean {
  return Boolean(
    item.ownerTenantName ||
    item.ownerTenantId ||
    item.ownerAdminEmail ||
    item.ownerAdminId
  );
}

function canFreeVmInventoryRow(item: SuperAdminVmInventoryItem): boolean {
  return (
    hasInventoryAssignee(item) ||
    hasKnownInventoryOwner(item) ||
    Boolean(inventoryNameSubtitle(item.name, item.ipAddress))
  );
}

function inventoryNameSubtitle(name?: string, ipAddress?: string): string | null {
  const trimmedName = name?.trim();
  if (!trimmedName) return null;
  const trimmedIp = ipAddress?.trim();
  if (trimmedIp && trimmedName === trimmedIp) return null;
  return trimmedName;
}

function hasActiveAssignmentOverride(row: SuperAdminExternalVmOverviewRow): boolean {
  return row.assignments.some((assignment) => {
    if (!assignment.accessOverride) return false;
    if (!assignment.accessOverrideUntil) return true;
    return new Date(assignment.accessOverrideUntil).getTime() > Date.now();
  });
}

function getDueDateBadge(value?: string | Date | null): { label: string; tone: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(date);
  dueDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) {
    return { label: `Overdue by ${Math.abs(diffDays)}d`, tone: 'border-rose-200 bg-rose-50 text-rose-700' };
  }
  if (diffDays === 0) {
    return { label: 'Due today', tone: 'border-amber-200 bg-amber-50 text-amber-700' };
  }
  if (diffDays <= 7) {
    return { label: `Due in ${diffDays}d`, tone: 'border-amber-200 bg-amber-50 text-amber-700' };
  }
  if (diffDays <= 30) {
    return { label: `Due in ${diffDays}d`, tone: 'border-yellow-200 bg-yellow-50 text-yellow-700' };
  }

  return { label: `Due in ${diffDays}d`, tone: 'border-gray-200 bg-gray-50 text-gray-600' };
}

function DueDateCell({ value }: { value?: string | Date | null }) {
  const badge = getDueDateBadge(value);

  return (
    <div className="space-y-1">
      <p className="text-gray-700">{formatDate(value)}</p>
      {badge ? (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.tone}`}>
          {badge.label}
        </span>
      ) : null}
    </div>
  );
}

function ConfirmActionModal(props: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  confirmText?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
        <p className="text-sm text-gray-800">{props.message}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.busy}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.busy}
            className="rounded-md bg-[#B91C1C] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.busy ? `${props.confirmText || 'Processing'}…` : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

function readCell(row: Record<string, unknown>, keys: string[]): unknown {
  const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedRowEntries = Object.entries(row).map(([key, value]) => [
    normalizeHeader(key),
    value,
  ] as const);

  // Exact matches across every alias first. Otherwise a short alias such as
  // "Start Date" prefix-matches "Start Time" and never reaches "Provider Start Date".
  for (const key of keys) {
    if (key in row) return row[key];
  }

  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const exact = normalizedRowEntries.find(([rowKey]) => rowKey === normalizedKey);
    if (exact) return exact[1];
  }

  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    // Excel often truncates headers in the UI (e.g. "Plan Durat" for "Plan Duration").
    const prefixLength = Math.min(5, normalizedKey.length);
    const prefix = normalizedKey.slice(0, prefixLength);
    const partial = normalizedRowEntries.find(([rowKey]) => {
      if (rowKey.length < 3) return false;
      return rowKey.startsWith(prefix) || normalizedKey.startsWith(rowKey.slice(0, prefixLength));
    });
    if (partial) return partial[1];
  }
  return undefined;
}

function normalizeCanonicalIpv4(ipAddress: string): string {
  const trimmed = ipAddress.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return trimmed;
  }
  return parts.map((part) => String(parseInt(part, 10))).join('.');
}

function normalizeIpCell(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeCanonicalIpv4(String(value));
  }
  return normalizeCanonicalIpv4(String(value).trim());
}

function getRowVmSpecs(row: AssignmentRow): string[] {
  if (row.vmSpecs.length > 0) return row.vmSpecs;
  const fromProvider = row.providerDetails?.vmSpec?.trim();
  return fromProvider ? [fromProvider] : [];
}

function getRowProviderEntries(row: AssignmentRow): AssignmentEntry[] {
  if (row.assignments.length > 0) {
    return row.assignments.map((assignment) => ({
      ...assignment,
      planDuration: assignment.planDuration ?? row.providerDetails?.planDuration ?? null,
      vmSpec: assignment.vmSpec ?? row.providerDetails?.vmSpec ?? null,
      vmUsername: assignment.vmUsername ?? row.providerDetails?.vmUsername ?? null,
      vmPassword: assignment.vmPassword ?? row.providerDetails?.vmPassword ?? null,
      providerStartDate: row.providerDetails?.providerStartDate ?? assignment.providerStartDate ?? null,
      providerEndDate: row.providerDetails?.providerEndDate ?? assignment.providerEndDate ?? null,
    }));
  }
  return row.providerDetails ? [row.providerDetails] : [];
}

const PROVIDER_START_DATE_HEADERS = [
  'Provider Start Date',
  'Provider Start',
  'Provider From Date',
  'Valid From',
  'From Date',
  'Activation Date',
  'Contract Start',
  'Start Date',
  'startDate',
];

const PROVIDER_END_DATE_HEADERS = [
  'Provider End Date',
  'Provider End',
  'Provider To Date',
  'Valid Till',
  'Valid To',
  'Valid Until',
  'To Date',
  'Expiry Date',
  'Expiration Date',
  'Expiry',
  'End Date',
  'endDate',
];

function toUtcDateOnlyIso(year: number, monthIndex: number, day: number): string | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) return undefined;
  if (year < 1990 || year > 2100 || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString();
}

function excelSerialToUtcDateOnlyIso(serial: number): string | undefined {
  if (!Number.isFinite(serial)) return undefined;
  const whole = Math.floor(serial);
  // Excel serial ~1990-01-01 through ~2100-12-31. Smaller numbers are not dates.
  if (whole < 32874 || whole > 73415) return undefined;
  const utc = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (Number.isNaN(utc.getTime())) return undefined;
  return toUtcDateOnlyIso(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function parseTwoDigitYear(raw: string): number | undefined {
  if (raw.length === 2) {
    const n = Number(raw);
    if (!Number.isInteger(n)) return undefined;
    return n >= 70 ? 1900 + n : 2000 + n;
  }
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

function isDateLike(value: unknown): value is Date {
  return (
    value instanceof Date ||
    (typeof value === 'object' &&
      value !== null &&
      typeof (value as Date).getTime === 'function' &&
      !Number.isNaN((value as Date).getTime()))
  );
}

function dateObjectToUtcDateOnlyIso(value: Date): string | undefined {
  const utcHours =
    value.getUTCHours() +
    value.getUTCMinutes() / 60 +
    value.getUTCSeconds() / 3600 +
    value.getUTCMilliseconds() / 3600000;
  // True UTC midnight date-only values can be used as-is.
  if (utcHours < 0.001) {
    return toUtcDateOnlyIso(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  // Excel date-only cells are often timezone-shifted, e.g. 2026-08-12 in IST
  // becomes 2026-08-11T18:29:50.000Z. Round to the nearest calendar day.
  const shifted = new Date(value.getTime() + 12 * 60 * 60 * 1000);
  return toUtcDateOnlyIso(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function normalizeDateCell(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;

  if (isDateLike(value)) {
    return dateObjectToUtcDateOnlyIso(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const asInt = Math.trunc(value);
    if (asInt >= 19900101 && asInt <= 21001231) {
      const asText = String(asInt);
      if (asText.length === 8) {
        const fromCompact = toUtcDateOnlyIso(
          Number(asText.slice(0, 4)),
          Number(asText.slice(4, 6)) - 1,
          Number(asText.slice(6, 8))
        );
        if (fromCompact) return fromCompact;
      }
    }
    return excelSerialToUtcDateOnlyIso(value);
  }

  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const fromSerial = excelSerialToUtcDateOnlyIso(numeric);
    if (fromSerial) return fromSerial;
    if (/^\d{8}$/.test(trimmed)) {
      const fromCompact = toUtcDateOnlyIso(
        Number(trimmed.slice(0, 4)),
        Number(trimmed.slice(4, 6)) - 1,
        Number(trimmed.slice(6, 8))
      );
      if (fromCompact) return fromCompact;
    }
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[tT\s](.+))?$/);
  if (isoMatch) {
    const timePart = isoMatch[4]?.trim();
    if (!timePart || /^00:00:00(\.0+)?(z|[+-]00:00)?$/i.test(timePart)) {
      return toUtcDateOnlyIso(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }
    const parsedIso = new Date(trimmed);
    if (!Number.isNaN(parsedIso.getTime())) return dateObjectToUtcDateOnlyIso(parsedIso);
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[/.\\-](\d{1,2})[/.\\-](\d{2,4})$/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const year = parseTwoDigitYear(dmyMatch[3]);
    if (year) {
      if (first > 12 && second >= 1 && second <= 12) {
        return toUtcDateOnlyIso(year, second - 1, first);
      }
      if (second > 12 && first >= 1 && first <= 12) {
        return toUtcDateOnlyIso(year, first - 1, second);
      }
      // Ambiguous 01/02/2026: prefer DMY for this product.
      return toUtcDateOnlyIso(year, second - 1, first);
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return dateObjectToUtcDateOnlyIso(parsed);
  return undefined;
}

function cellHasValue(value: unknown): boolean {
  if (value == null || value === '') return false;
  if (typeof value === 'string' && !value.trim()) return false;
  return true;
}

function formatCellSample(value: unknown): string {
  if (!cellHasValue(value)) return '(empty)';
  if (isDateLike(value)) return value.toISOString();
  return String(value).trim().slice(0, 80);
}

const DATE_FORMAT_HINT =
  'Use Excel date cells, or text like 2026-08-12 or 12-08-2026.';

function toSortDate(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function getRowSortDate(row: AssignmentRow, sortBy: AssignmentSortBy): number | null {
  const sourceEntries = row.assignments.length > 0 ? row.assignments : row.providerDetails ? [row.providerDetails] : [];
  const values = sourceEntries
    .map((entry) => (sortBy === 'providerEndDate' ? entry.providerEndDate : entry.endDate))
    .map((value) => toSortDate(value))
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;
  return Math.min(...values);
}

function sortAssignmentRows(rows: AssignmentRow[], sortBy: AssignmentSortBy, sortDirection: SortDirection): AssignmentRow[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  if (sortBy === 'assignedUser') {
    return [...rows].sort((a, b) => {
      const aFree = a.assignments.length === 0;
      const bFree = b.assignments.length === 0;

      if (aFree !== bFree) {
        // asc => free rows first, desc => assigned rows first
        return (aFree ? -1 : 1) * direction;
      }

      const aUser = a.assignments[0]?.username?.toLowerCase() ?? '';
      const bUser = b.assignments[0]?.username?.toLowerCase() ?? '';
      const byUser = aUser.localeCompare(bUser);
      if (byUser !== 0) return byUser * direction;

      return a.rowKey.localeCompare(b.rowKey);
    });
  }

  if (sortBy === 'locked') {
    return [...rows].sort((a, b) => {
      const aLocked = a.inventoryLocked ? 1 : 0;
      const bLocked = b.inventoryLocked ? 1 : 0;
      if (aLocked !== bLocked) return (aLocked - bLocked) * direction;
      return a.rowKey.localeCompare(b.rowKey);
    });
  }

  return [...rows].sort((a, b) => {
    const aDate = getRowSortDate(a, sortBy);
    const bDate = getRowSortDate(b, sortBy);

    if (aDate === null && bDate === null) return a.rowKey.localeCompare(b.rowKey);
    if (aDate === null) return 1;
    if (bDate === null) return -1;

    const diff = aDate - bDate;
    if (diff !== 0) return diff * direction;

    return a.rowKey.localeCompare(b.rowKey);
  });
}

function buildAssignmentRows(items: SuperAdminVmInventoryItem[]): AssignmentRow[] {
  const grouped = new Map<string, AssignmentRow>();

  for (const item of items) {
    const key = item.ipAddress?.trim() ? item.ipAddress.trim() : item.inventoryId;
    const current = grouped.get(key) ?? {
      rowKey: key,
      ipAddress: item.ipAddress || '—',
      vmNames: [],
      vmSpecs: [],
      projectNames: [],
      clientNames: [],
      assignments: [],
      vmLogins: [],
    };

    const displayName = inventoryNameSubtitle(item.name, item.ipAddress);
    if (displayName && !current.vmNames.includes(displayName)) {
      current.vmNames.push(displayName);
    }

    const vmSpecLabel = String(item.providerVmSpec ?? '').trim();
    if (vmSpecLabel && !current.vmSpecs.includes(vmSpecLabel)) {
      current.vmSpecs.push(vmSpecLabel);
    }

    const projectLabel = String(item.projectName ?? item.projectId ?? '').trim();
    if (projectLabel && !current.projectNames.includes(projectLabel)) {
      current.projectNames.push(projectLabel);
    }

    const clientLabel = String(item.projectClientName ?? '').trim();
    if (clientLabel && !current.clientNames.includes(clientLabel)) {
      current.clientNames.push(clientLabel);
    }

    if (!current.editableExternalVmId && item.resourceType === 'external_vm') {
      current.editableExternalVmId = item.sourceId;
    }

    if (
      !current.providerDetails &&
      (item.providerUsername ||
        item.providerPassword ||
        item.providerStartDate ||
        item.providerEndDate ||
        item.providerPlanDuration)
    ) {
      current.providerDetails = {
        username: item.providerUsername?.trim() || item.name,
        isTenantUser: false,
        ownerKey: item.ownerScope === 'tenant'
          ? `tenant:${item.ownerTenantId ?? item.ownerTenantName ?? ''}`
          : `admin:${item.ownerAdminId ?? item.ownerAdminEmail ?? ''}`,
        tenantName: undefined,
        planDuration: item.providerPlanDuration ?? null,
        vmUsername: item.providerUsername ?? null,
        vmPassword: item.providerPassword ?? null,
        providerStartDate: item.providerStartDate ?? null,
        providerEndDate: item.providerEndDate ?? null,
        startDate: null,
        endDate: null,
      };
    }

    const latestUpdatedAt = Number.isNaN(new Date(item.updatedAt).getTime())
      ? 0
      : new Date(item.updatedAt).getTime();
    const ownerKey = item.ownerScope === 'tenant'
      ? `tenant:${item.ownerTenantId ?? item.ownerTenantName ?? ''}`
      : `admin:${item.ownerAdminId ?? item.ownerAdminEmail ?? ''}`;
    const assignmentByPriorityKey = new Map<
      string,
      { assignment: AssignmentEntry; updatedAtMs: number }
    >();

    for (const existing of current.assignments) {
      const existingIdentity = String(existing.username ?? '').trim().toLowerCase();
      const existingOwnerKey = existing.ownerKey ?? (existing.isTenantUser
        ? `tenant:${existing.tenantName ?? ''}`
        : ownerKey);
      const dedupeKey = `${existingOwnerKey}|${existingIdentity}|${current.ipAddress.trim().toLowerCase()}`;
      assignmentByPriorityKey.set(dedupeKey, {
        assignment: existing,
        updatedAtMs: 0,
      });
    }

    for (const assignment of item.mappedAssignments) {
      const identity = String(assignment.username ?? '').trim().toLowerCase();
      const assignmentOwnerKey = assignment.isTenantUser
        ? `tenant:${assignment.tenantName ?? item.ownerTenantName ?? item.ownerTenantId ?? ''}`
        : `admin:${item.ownerAdminId ?? item.ownerAdminEmail ?? ''}`;
      const dedupeKey = `${assignmentOwnerKey}|${identity}|${current.ipAddress.trim().toLowerCase()}`;
      const currentRecord = assignmentByPriorityKey.get(dedupeKey);
      const normalizedAssignment: AssignmentEntry = {
        ...assignment,
        ownerKey: assignmentOwnerKey,
      };

      if (!currentRecord || latestUpdatedAt >= currentRecord.updatedAtMs) {
        assignmentByPriorityKey.set(dedupeKey, {
          assignment: normalizedAssignment,
          updatedAtMs: latestUpdatedAt,
        });
      }
    }

    current.assignments = [...assignmentByPriorityKey.values()]
      .map((entry) => entry.assignment)
      .sort((a, b) => a.username.localeCompare(b.username));

    grouped.set(key, current);
  }

  return [...grouped.values()];
}

function overviewOwnerLabel(row: SuperAdminExternalVmOverviewRow): string {
  if (row.tenantName) return row.tenantName;
  if (row.adminEmail) return row.adminEmail;
  return 'Unassigned';
}

function matchesOverviewOwnerFilter(row: SuperAdminExternalVmOverviewRow, ownerSearch: string): boolean {
  const query = ownerSearch.trim().toLowerCase();
  if (!query) return true;
  return overviewOwnerLabel(row).toLowerCase().includes(query);
}

function buildOwnerOptionsFromOverview(rows: SuperAdminExternalVmOverviewRow[]): SuperAdminVmInventoryOwnerOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = overviewOwnerLabel(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function scoreOverviewRowForEdit(row: SuperAdminExternalVmOverviewRow): number {
  return row.assignments.length * 100 + (row.tenantId ? 10 : 0) + (row.adminId ? 5 : 0);
}

function overviewClientLabel(row: SuperAdminExternalVmOverviewRow): string {
  const projectClient = String(row.projectClientName ?? '').trim();
  if (projectClient) return projectClient;

  const tenantName = String(row.tenantName ?? '').trim();
  if (tenantName) return tenantName;

  return String(row.tenantSlug ?? '').trim();
}

function resolveOverviewRowForManage(
  assignmentRow: AssignmentRow,
  overviewRows: SuperAdminExternalVmOverviewRow[]
): SuperAdminExternalVmOverviewRow | undefined {
  const byId = (id: string) => overviewRows.find((item) => item.externalVmId === id);

  if (assignmentRow.editableExternalVmId) {
    const preferred = byId(assignmentRow.editableExternalVmId);
    if (preferred?.assignments.length) return preferred;
  }

  const ip = assignmentRow.ipAddress.trim();
  if (!ip || ip === '—') {
    return assignmentRow.editableExternalVmId
      ? byId(assignmentRow.editableExternalVmId)
      : undefined;
  }

  const candidates = overviewRows.filter((row) => row.ipAddress?.trim() === ip);
  if (candidates.length === 0) {
    return assignmentRow.editableExternalVmId
      ? byId(assignmentRow.editableExternalVmId)
      : undefined;
  }

  return [...candidates].sort((left, right) => scoreOverviewRowForEdit(right) - scoreOverviewRowForEdit(left))[0];
}

function buildAssignmentRowsFromOverview(rows: SuperAdminExternalVmOverviewRow[]): AssignmentRow[] {
  const grouped = new Map<string, AssignmentRow & { editableScore?: number }>();

  for (const row of rows) {
    const key = row.ipAddress?.trim() ? row.ipAddress.trim() : row.externalVmId;
    const ownerKey = row.tenantId
      ? `tenant:${row.tenantId}`
      : row.adminId
        ? `admin:${row.adminId}`
        : 'free';
    const latestUpdatedAt = Number.isNaN(new Date(row.updatedAt).getTime())
      ? 0
      : new Date(row.updatedAt).getTime();

    const current = grouped.get(key) ?? {
      rowKey: key,
      ipAddress: row.ipAddress || '—',
      vmNames: [],
      vmSpecs: [],
      projectNames: [],
      clientNames: [],
      assignments: [],
      vmLogins: [],
    };

    const displayName = inventoryNameSubtitle(row.name, row.ipAddress);
    if (displayName && !current.vmNames.includes(displayName)) {
      current.vmNames.push(displayName);
    }

    if (!current.vmLogins.some((login) => login.externalVmId === row.externalVmId)) {
      current.vmLogins.push({
        externalVmId: row.externalVmId,
        name: row.name,
        vmUsername: row.username || row.providerUsername || null,
        vmPassword: row.password || null,
      });
    }

    const vmSpecLabel = String(row.providerVmSpec ?? '').trim();
    if (vmSpecLabel && !current.vmSpecs.includes(vmSpecLabel)) {
      current.vmSpecs.push(vmSpecLabel);
    }

    const projectLabel = String(row.projectName ?? row.projectId ?? '').trim();
    if (projectLabel && !current.projectNames.includes(projectLabel)) {
      current.projectNames.push(projectLabel);
    }

    const clientLabel = overviewClientLabel(row);
    if (clientLabel && !current.clientNames.includes(clientLabel)) {
      current.clientNames.push(clientLabel);
    }

    const rowScore = scoreOverviewRowForEdit(row);
    if (
      current.editableExternalVmId === undefined ||
      rowScore > (current.editableScore ?? -1)
    ) {
      current.editableExternalVmId = row.externalVmId;
      current.editableScore = rowScore;
      current.inventoryLocked = Boolean(row.inventoryLocked);
    }

    if (
      row.providerVmSpec ||
      row.providerUsername ||
      row.password ||
      row.providerStartDate ||
      row.providerEndDate ||
      row.providerPlanDuration
    ) {
      current.providerDetails = {
        username: row.providerUsername?.trim() || current.providerDetails?.username || row.name,
        isTenantUser: false,
        ownerKey: current.providerDetails?.ownerKey ?? ownerKey,
        tenantName: row.tenantName ?? current.providerDetails?.tenantName,
        planDuration: row.providerPlanDuration ?? current.providerDetails?.planDuration ?? null,
        vmSpec: row.providerVmSpec ?? current.providerDetails?.vmSpec ?? null,
        vmUsername: row.providerUsername ?? row.username ?? current.providerDetails?.vmUsername ?? null,
        vmPassword: row.password ?? current.providerDetails?.vmPassword ?? null,
        providerStartDate: row.providerStartDate ?? current.providerDetails?.providerStartDate ?? null,
        providerEndDate: row.providerEndDate ?? current.providerDetails?.providerEndDate ?? null,
        startDate: current.providerDetails?.startDate ?? null,
        endDate: current.providerDetails?.endDate ?? null,
      };
    }

    const assignmentByPriorityKey = new Map<
      string,
      { assignment: AssignmentEntry; updatedAtMs: number }
    >();

    for (const existing of current.assignments) {
      const existingIdentity = String(existing.username ?? '').trim().toLowerCase();
      const existingOwnerKey = existing.ownerKey ?? (existing.isTenantUser
        ? `tenant:${existing.tenantName ?? ''}`
        : ownerKey);
      const dedupeKey = `${existingOwnerKey}|${existingIdentity}|${current.ipAddress.trim().toLowerCase()}`;
      assignmentByPriorityKey.set(dedupeKey, {
        assignment: existing,
        updatedAtMs: 0,
      });
    }

    for (const assignment of row.assignments) {
      const username = assignment.email ?? assignment.username ?? assignment.userId ?? assignment.tenantUserId ?? 'Unknown';
      const isTenantUser = assignment.stack === 'tenant';
      const assignmentOwnerKey = isTenantUser
        ? `tenant:${row.tenantId ?? row.tenantName ?? ''}`
        : `admin:${row.adminId ?? row.adminEmail ?? ''}`;
      const identity = String(username).trim().toLowerCase();
      const dedupeKey = `${assignmentOwnerKey}|${identity}|${current.ipAddress.trim().toLowerCase()}`;
      const currentRecord = assignmentByPriorityKey.get(dedupeKey);
      const normalizedAssignment: AssignmentEntry = {
        username,
        isTenantUser,
        ownerKey: assignmentOwnerKey,
        tenantName: row.tenantName ?? undefined,
        planDuration: row.providerPlanDuration ?? null,
        vmSpec: row.providerVmSpec ?? null,
        vmUsername: row.username || row.providerUsername || null,
        vmPassword: row.password ?? null,
        providerStartDate:
          row.providerStartDate ?? current.providerDetails?.providerStartDate ?? null,
        providerEndDate: row.providerEndDate ?? current.providerDetails?.providerEndDate ?? null,
        startDate: assignment.schedule?.effectiveFrom ?? null,
        endDate: assignment.schedule?.effectiveTo ?? null,
      };

      if (!currentRecord || latestUpdatedAt >= currentRecord.updatedAtMs) {
        assignmentByPriorityKey.set(dedupeKey, {
          assignment: normalizedAssignment,
          updatedAtMs: latestUpdatedAt,
        });
      }
    }

    current.assignments = [...assignmentByPriorityKey.values()]
      .map((entry) => {
        const assignment = entry.assignment;
        return {
          ...assignment,
          providerStartDate:
            current.providerDetails?.providerStartDate ?? assignment.providerStartDate ?? null,
          providerEndDate:
            current.providerDetails?.providerEndDate ?? assignment.providerEndDate ?? null,
        };
      })
      .sort((a, b) => a.username.localeCompare(b.username));

    grouped.set(key, current);
  }

  return [...grouped.values()].map(({ editableScore: _editableScore, ...row }) => row);
}

function InventoryTable(props: {
  items: SuperAdminVmInventoryItem[];
  ownerOptions: SuperAdminVmInventoryOwnerOption[];
  selectedOwner: string;
  onSelectedOwnerChange: (value: string) => void;
  serviceKey: ServiceKey;
  onServiceKeyChange: (value: ServiceKey) => void;
  sortBy: SortBy;
  sortDirection: SortDirection;
  onToggleSort: (value: SortBy) => void;
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  onLimitChange: (value: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  freeingVmInventoryId: string | null;
  selectedInventoryIds: string[];
  onToggleInventorySelection: (item: SuperAdminVmInventoryItem, checked: boolean) => void;
  onToggleAllSelection: (checked: boolean) => void;
  onBulkFreeVmAndDeleteUser: () => void;
  onBulkResetMachines: () => void;
  bulkBusy: boolean;
  onFreeVmAndDeleteUser: (item: SuperAdminVmInventoryItem) => void;
  onResetMachine: (item: SuperAdminVmInventoryItem) => void;
  resetingVmInventoryId: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const sortIndicator = (column: SortBy) => {
    if (props.sortBy !== column) return '↕';
    return props.sortDirection === 'asc' ? '↑' : '↓';
  };
  const selectableRows = props.items;
  const allSelected = selectableRows.length > 0 && selectableRows.every((item) => props.selectedInventoryIds.includes(item.inventoryId));
  const someSelected = selectableRows.some((item) => props.selectedInventoryIds.includes(item.inventoryId));

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-gray-900">Inventory IP</p>
          {props.selectedInventoryIds.length > 0 ? (
            <span className="text-xs text-gray-500">Selected {props.selectedInventoryIds.length}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>Total {props.total.toLocaleString()}</span>
          <span>•</span>
          <span>Page {props.page} / {props.totalPages}</span>
          {props.selectedInventoryIds.length > 0 ? (
            <>
              <button
                type="button"
                onClick={props.onBulkFreeVmAndDeleteUser}
                disabled={props.bulkBusy}
                className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete user & make VM free
              </button>
              <button
                type="button"
                onClick={props.onBulkResetMachines}
                disabled={props.bulkBusy}
                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="h-3 w-3" />
                Reset VMs
              </button>
            </>
          ) : null}
        </div>
      </div>

      {props.loading ? <TableSkeleton rows={8} cols={7} /> : null}

      {!props.loading && props.error ? (
        <div className="p-6">
          <ErrorState message={props.error} onRetry={props.onRetry} />
        </div>
      ) : null}

      {!props.loading && !props.error && props.items.length === 0 ? (
        <div className="p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <Database className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">No VM inventory records match current filters.</p>
        </div>
      ) : null}

      {!props.loading && !props.error && props.items.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 first:px-6">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(node) => {
                        if (node) node.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={(e) => props.onToggleAllSelection(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                      aria-label="Select all inventory rows"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 first:px-6">IP</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => props.onToggleSort('service')}
                        className="inline-flex shrink-0 items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                      >
                        Service
                        <span className="text-gray-400">{sortIndicator('service')}</span>
                      </button>
                      <select
                        value={props.serviceKey}
                        onChange={(e) => props.onServiceKeyChange(e.target.value as ServiceKey)}
                        className="min-w-[170px] rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium normal-case tracking-normal text-gray-700"
                      >
                        <option value="">All services</option>
                        <option value="vm-management">VPS Hosting</option>
                        <option value="create-vm">VM Catalog</option>
                        <option value="external-vm">External VM Import</option>
                      </select>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => props.onToggleSort('owner')}
                        className="inline-flex shrink-0 items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                      >
                        Owner
                        <span className="text-gray-400">{sortIndicator('owner')}</span>
                      </button>
                      <select
                        value={props.selectedOwner}
                        onChange={(e) => props.onSelectedOwnerChange(e.target.value)}
                        className="min-w-[180px] rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium normal-case tracking-normal text-gray-700"
                      >
                        <option value="">All owners</option>
                        {props.ownerOptions.map((owner) => (
                          <option key={owner.label} value={owner.label}>
                            {owner.label} ({owner.count})
                          </option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned user name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((item, idx) => (
                  <tr key={item.inventoryId} className={`border-b border-gray-50 align-top hover:bg-gray-50 ${idx % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-4 py-3.5 first:px-6">
                      <input
                        type="checkbox"
                        checked={props.selectedInventoryIds.includes(item.inventoryId)}
                        disabled={props.bulkBusy}
                        onChange={(e) => props.onToggleInventorySelection(item, e.target.checked)}
                        className="h-5 w-5 cursor-pointer rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C] disabled:cursor-not-allowed"
                        aria-label={`Select ${item.name || item.ipAddress || item.inventoryId}`}
                      />
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-gray-900">{item.ipAddress || '—'}</p>
                      {inventoryNameSubtitle(item.name, item.ipAddress) ? (
                        <p className="mt-0.5 text-[11px] text-gray-500">{item.name}</p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-gray-400">—</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-700">{item.originServiceLabel}</td>
                    <td className="px-4 py-3.5 text-xs">
                      {hasKnownInventoryOwner(item) ? (
                        <>
                          <OwnerChip scope={item.ownerScope} ownerEmail={item.ownerAdminEmail} />
                          <p className="mt-1 text-gray-700">{item.ownerTenantName || item.ownerAdminEmail || 'Unknown owner'}</p>
                        </>
                      ) : (
                        <p className="text-[11px] text-gray-400">Unassigned</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-700">
                      {item.mappedAssignments.length > 0 ? (
                        item.mappedAssignments.map((assignment, assignmentIndex) => (
                          <p key={`${item.inventoryId}:assigned-email:${assignmentIndex}`}>{assignment.username}</p>
                        ))
                      ) : item.mappedUsers.length > 0 ? (
                        item.mappedUsers.map((email, emailIndex) => (
                          <p key={`${item.inventoryId}:assigned-fallback:${emailIndex}`}>{email}</p>
                        ))
                      ) : (
                        <span className="text-[11px] text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => props.onFreeVmAndDeleteUser(item)}
                          disabled={
                            !canFreeVmInventoryRow(item) ||
                            props.freeingVmInventoryId === item.inventoryId ||
                            props.bulkBusy
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete user & make VM free
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onResetMachine(item)}
                          disabled={
                            props.resetingVmInventoryId === item.inventoryId ||
                            props.bulkBusy
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reset VM
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Rows</span>
              <select
                value={props.limit}
                onChange={(e) => props.onLimitChange(Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={props.page <= 1} onClick={props.onPreviousPage} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
              <span className="text-sm text-gray-600">{props.page} / {props.totalPages}</span>
              <button type="button" disabled={props.page >= props.totalPages} onClick={props.onNextPage} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function AssignmentTable(props: {
  rows: AssignmentRow[];
  page: number;
  totalPages: number;
  totalVmCount: number;
  totalExternalVmCount: number;
  selectedExternalVmIds: string[];
  showVmNames: boolean;
  showProjects: boolean;
  showClients: boolean;
  showVmSpec: boolean;
  showPlanDuration: boolean;
  projectFilter: string;
  projectOptions: string[];
  clientFilter: string;
  clientOptions: string[];
  showUsers: boolean;
  sortBy: AssignmentSortBy;
  sortDirection: SortDirection;
  onShowVmNames: () => void;
  onHideVmNames: () => void;
  onShowProjects: () => void;
  onHideProjects: () => void;
  onShowClients: () => void;
  onHideClients: () => void;
  onShowVmSpec: () => void;
  onHideVmSpec: () => void;
  onShowPlanDuration: () => void;
  onHidePlanDuration: () => void;
  onProjectFilterChange: (value: string) => void;
  onClientFilterChange: (value: string) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onShowUsers: () => void;
  onHideUsers: () => void;
  onToggleSort: (value: AssignmentSortBy) => void;
  onToggleRowSelection: (externalVmId: string, checked: boolean) => void;
  onTogglePageSelection: (checked: boolean) => void;
  onBulkGrantOverride: () => void;
  onBulkDeleteSelected: () => void;
  onEditRow: (row: AssignmentRow) => void;
  onDeleteRow: (row: AssignmentRow) => void;
  onToggleLock: (row: AssignmentRow) => void;
  deletingVmId: string | null;
  lockingVmId: string | null;
  bulkDeleteBusy: boolean;
}) {
  const entryList = (row: AssignmentRow): AssignmentEntry[] => getRowProviderEntries(row);
  const loginList = (row: AssignmentRow) =>
    row.vmLogins.length > 0
      ? row.vmLogins
      : entryList(row).map((entry) => ({
          externalVmId: row.editableExternalVmId ?? row.rowKey,
          name: '',
          vmUsername: entry.vmUsername ?? null,
          vmPassword: entry.vmPassword ?? null,
        }));
  const assignedUserList = (row: AssignmentRow): AssignmentEntry[] => row.assignments;
  const vmSpecList = (row: AssignmentRow): string[] => getRowVmSpecs(row);
  const selectableRows = props.rows.filter((row) => Boolean(row.editableExternalVmId));
  const selectableRowIds = selectableRows
    .map((row) => row.editableExternalVmId)
    .filter((value): value is string => Boolean(value));
  const selectedVisibleCount = selectableRowIds.filter((id) => props.selectedExternalVmIds.includes(id)).length;
  const allVisibleSelected = selectableRowIds.length > 0 && selectedVisibleCount === selectableRowIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const sortIndicator = (column: AssignmentSortBy) => {
    if (props.sortBy !== column) return '↕';
    return props.sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">VM assignment view</p>
          <p className="text-xs text-gray-500">IP-first view with merged VM names and user mappings</p>
          <p className="text-xs font-medium text-gray-700">
            Total VMs: {props.totalVmCount}
            {props.totalExternalVmCount !== props.totalVmCount ? (
              <span className="font-normal text-gray-500"> ({props.totalExternalVmCount} external records)</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={props.selectedExternalVmIds.length === 0 || props.bulkDeleteBusy}
            onClick={props.onBulkGrantOverride}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Shield className="h-3.5 w-3.5" />
            {`Grant override${props.selectedExternalVmIds.length > 0 ? ` (${props.selectedExternalVmIds.length})` : ''}`}
          </button>
          <button
            type="button"
            disabled={props.selectedExternalVmIds.length === 0 || props.bulkDeleteBusy}
            onClick={props.onBulkDeleteSelected}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {props.bulkDeleteBusy
              ? 'Deleting selected…'
              : `Delete selected${props.selectedExternalVmIds.length > 0 ? ` (${props.selectedExternalVmIds.length})` : ''}`}
          </button>
          {!props.showVmNames ? (
            <button type="button" onClick={props.onShowVmNames} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white text-[10px] leading-none">+</span>
              VM name
            </button>
          ) : null}
          {!props.showProjects ? (
            <button type="button" onClick={props.onShowProjects} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white text-[10px] leading-none">+</span>
              Project
            </button>
          ) : null}
          {!props.showClients ? (
            <button type="button" onClick={props.onShowClients} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white text-[10px] leading-none">+</span>
              Assigned client
            </button>
          ) : null}
          {!props.showVmSpec ? (
            <button type="button" onClick={props.onShowVmSpec} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white text-[10px] leading-none">+</span>
              VM Spec
            </button>
          ) : null}
          {!props.showPlanDuration ? (
            <button type="button" onClick={props.onShowPlanDuration} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white text-[10px] leading-none">+</span>
              Plan duration
            </button>
          ) : null}
          {!props.showUsers ? (
            <button type="button" onClick={props.onShowUsers} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white text-[10px] leading-none">+</span>
              Assigned usernames
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 first:px-6">
                <input
                  ref={(node) => {
                    if (node) node.indeterminate = someVisibleSelected;
                  }}
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={selectableRowIds.length === 0}
                  onChange={(e) => props.onTogglePageSelection(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                  aria-label="Select all visible deletable VMs"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 first:px-6">IP</th>
              {props.showVmNames ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>VM name</span>
                    <button type="button" onClick={props.onHideVmNames} className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] font-medium normal-case tracking-normal text-gray-600 hover:bg-gray-100" aria-label="Collapse VM name column">-</button>
                  </div>
                </th>
              ) : null}
              {props.showProjects ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>Project</span>
                    <button type="button" onClick={props.onHideProjects} className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] font-medium normal-case tracking-normal text-gray-600 hover:bg-gray-100" aria-label="Collapse project column">-</button>
                    <select
                      value={props.projectFilter}
                      onChange={(e) => props.onProjectFilterChange(e.target.value)}
                      className="w-[130px] rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-gray-700"
                    >
                      <option value="">All projects</option>
                      {props.projectOptions.map((project) => (
                        <option key={project} value={project}>
                          {project}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
              ) : null}
              {props.showClients ? (
                <th className="w-[180px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <span>Assigned client</span>
                      <button type="button" onClick={props.onHideClients} className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] font-medium normal-case tracking-normal text-gray-600 hover:bg-gray-100" aria-label="Collapse assigned client column">-</button>
                    </div>
                    <select
                      value={props.clientFilter}
                      onChange={(e) => props.onClientFilterChange(e.target.value)}
                      className="w-[108px] rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[10px] font-medium normal-case tracking-normal text-gray-700"
                    >
                      <option value="">All clients</option>
                      {props.clientOptions.map((client) => (
                        <option key={client} value={client}>
                          {client}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
              ) : null}
              {props.showUsers ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => props.onToggleSort('assignedUser')}
                      className="inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                    >
                      Assigned usernames
                      <span className="text-gray-400">{sortIndicator('assignedUser')}</span>
                    </button>
                    <button type="button" onClick={props.onHideUsers} className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] font-medium normal-case tracking-normal text-gray-600 hover:bg-gray-100" aria-label="Collapse assigned usernames column">-</button>
                  </div>
                </th>
              ) : null}
              {props.showPlanDuration ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>Plan duration</span>
                    <button type="button" onClick={props.onHidePlanDuration} className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] font-medium normal-case tracking-normal text-gray-600 hover:bg-gray-100" aria-label="Collapse plan duration column">-</button>
                  </div>
                </th>
              ) : null}
              {props.showVmSpec ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>VM Spec</span>
                    <button type="button" onClick={props.onHideVmSpec} className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] font-medium normal-case tracking-normal text-gray-600 hover:bg-gray-100" aria-label="Collapse VM Spec column">-</button>
                  </div>
                </th>
              ) : null}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">VM username</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">VM password</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Provider start date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <button
                  type="button"
                  onClick={() => props.onToggleSort('providerEndDate')}
                  className="inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                >
                  Provider end date
                  <span className="text-gray-400">{sortIndicator('providerEndDate')}</span>
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Client start date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <button
                  type="button"
                  onClick={() => props.onToggleSort('clientEndDate')}
                  className="inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                >
                  Client end date
                  <span className="text-gray-400">{sortIndicator('clientEndDate')}</span>
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <button
                  type="button"
                  onClick={() => props.onToggleSort('locked')}
                  className="inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                >
                  Locked
                  <span className="text-gray-400">{sortIndicator('locked')}</span>
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, idx) => (
              <tr key={`${row.rowKey}:assignment`} className={`border-b border-gray-50 align-top hover:bg-gray-50 ${idx % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-4 py-3.5 text-xs first:px-6">
                  {row.editableExternalVmId ? (
                    <input
                      type="checkbox"
                      checked={props.selectedExternalVmIds.includes(row.editableExternalVmId)}
                      onChange={(e) => props.onToggleRowSelection(row.editableExternalVmId!, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                      aria-label={`Select ${row.vmNames[0] || row.ipAddress || 'VM'}`}
                    />
                  ) : (
                    <span className="text-[11px] text-gray-300">—</span>
                  )}
                </td>
                <td className="px-6 py-3.5 text-xs text-gray-700">{row.ipAddress}</td>
                {props.showVmNames ? (
                  <td className="px-4 py-3.5">
                    {row.vmNames.length > 0 ? row.vmNames.map((vmName, vmIndex) => <p key={`${row.rowKey}:vmname:${vmIndex}`} className="font-medium text-gray-900">{vmName}</p>) : <p className="text-[11px] text-gray-400">—</p>}
                  </td>
                ) : null}
                {props.showProjects ? (
                  <td className="px-4 py-3.5 text-xs">
                    {row.projectNames.length > 0 ? row.projectNames.map((projectName, projectIndex) => <p key={`${row.rowKey}:project:${projectIndex}`} className="text-gray-700">{projectName}</p>) : <p className="text-[11px] text-gray-400">—</p>}
                  </td>
                ) : null}
                {props.showClients ? (
                  <td className="max-w-[180px] px-4 py-3.5 text-xs">
                    {row.clientNames.length > 0 ? row.clientNames.map((clientName, clientIndex) => <p key={`${row.rowKey}:client:${clientIndex}`} className="truncate text-gray-700" title={clientName}>{clientName}</p>) : <p className="text-[11px] text-gray-400">—</p>}
                  </td>
                ) : null}
                {props.showUsers ? (
                  <td className="px-4 py-3.5 text-xs">
                    {assignedUserList(row).length > 0 ? assignedUserList(row).map((assignment, assignmentIndex) => (
                      <div key={`${row.rowKey}:assignment:${assignmentIndex}`} className="flex items-center gap-2">
                        <span className="text-gray-700">{assignment.username}</span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${assignment.isTenantUser ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                          {assignment.isTenantUser ? assignment.tenantName || 'Tenant' : 'Platform'}
                        </span>
                      </div>
                    )) : (
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Free VM
                      </span>
                    )}
                  </td>
                ) : null}
                {props.showPlanDuration ? (
                  <td className="px-4 py-3.5 text-xs">{entryList(row).length > 0 ? entryList(row).map((assignment, assignmentIndex) => <p key={`${row.rowKey}:plan:${assignmentIndex}`} className="text-gray-700">{assignment.planDuration || '—'}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                ) : null}
                {props.showVmSpec ? (
                  <td className="px-4 py-3.5 text-xs">
                    {vmSpecList(row).length > 0 ? vmSpecList(row).map((vmSpec, vmSpecIndex) => <p key={`${row.rowKey}:vmspec:${vmSpecIndex}`} className="text-gray-700">{vmSpec}</p>) : <p className="text-[11px] text-gray-400">—</p>}
                  </td>
                ) : null}
                <td className="px-4 py-3.5 text-xs">{loginList(row).length > 0 ? loginList(row).map((login, loginIndex) => <p key={`${row.rowKey}:vmuser:${login.externalVmId}:${loginIndex}`} className="text-gray-700">{login.vmUsername || '—'}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{loginList(row).length > 0 ? loginList(row).map((login, loginIndex) => <p key={`${row.rowKey}:vmpass:${login.externalVmId}:${loginIndex}`} className="text-gray-700">{login.vmPassword || '—'}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{entryList(row).length > 0 ? entryList(row).map((assignment, assignmentIndex) => <p key={`${row.rowKey}:provider-start:${assignmentIndex}`} className="text-gray-700">{formatDate(assignment.providerStartDate)}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{entryList(row).length > 0 ? entryList(row).map((assignment, assignmentIndex) => <DueDateCell key={`${row.rowKey}:provider-end:${assignmentIndex}`} value={assignment.providerEndDate} />) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{entryList(row).length > 0 ? entryList(row).map((assignment, assignmentIndex) => <p key={`${row.rowKey}:client-start:${assignmentIndex}`} className="text-gray-700">{formatDate(assignment.startDate)}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{entryList(row).length > 0 ? entryList(row).map((assignment, assignmentIndex) => <DueDateCell key={`${row.rowKey}:client-end:${assignmentIndex}`} value={assignment.endDate} />) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">
                  {row.inventoryLocked ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      <Lock className="h-3 w-3" />
                      Locked
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-xs">
                  {row.editableExternalVmId ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => props.onEditRow(row)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onToggleLock(row)}
                        disabled={props.lockingVmId === row.editableExternalVmId || props.bulkDeleteBusy}
                        title={row.inventoryLocked ? 'Unlock VM so it can be deleted' : 'Lock VM to prevent inventory delete'}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                          row.inventoryLocked
                            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {row.inventoryLocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        {props.lockingVmId === row.editableExternalVmId
                          ? row.inventoryLocked
                            ? 'Unlocking…'
                            : 'Locking…'
                          : row.inventoryLocked
                            ? 'Unlock'
                            : 'Lock'}
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onDeleteRow(row)}
                        disabled={
                          Boolean(row.inventoryLocked) ||
                          props.deletingVmId === row.editableExternalVmId
                        }
                        title={row.inventoryLocked ? 'Unlock this VM before deleting it' : 'Delete VM from inventory'}
                        className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {props.deletingVmId === row.editableExternalVmId ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
        <p className="text-xs text-gray-500">
          Page {props.page} / {props.totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={props.page <= 1}
            onClick={props.onPreviousPage}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={props.page >= props.totalPages}
            onClick={props.onNextPage}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminVmInventoryPage() {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<SuperAdminVmInventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ownerOptions, setOwnerOptions] = useState<SuperAdminVmInventoryOwnerOption[]>([]);
  const [selectedOwner, setSelectedOwner] = useState('');
  const [resourceType, setResourceType] = useState<'' | InventoryResourceType>('');
  const [ownerScope, setOwnerScope] = useState<'' | InventoryOwnerScope>('');
  const [serviceKey, setServiceKey] = useState<ServiceKey>('');
  const [status, setStatus] = useState<'' | InventoryStatus>('');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [assignmentSortBy, setAssignmentSortBy] = useState<AssignmentSortBy>('providerEndDate');
  const [assignmentSortDirection, setAssignmentSortDirection] = useState<SortDirection>('asc');
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [showAssignmentView, setShowAssignmentView] = useState(false);
  const [showAssignmentVmNames, setShowAssignmentVmNames] = useState(false);
  const [showAssignmentProjects, setShowAssignmentProjects] = useState(false);
  const [showAssignmentClients, setShowAssignmentClients] = useState(false);
  const [showAssignmentVmSpec, setShowAssignmentVmSpec] = useState(true);
  const [showAssignmentPlanDuration, setShowAssignmentPlanDuration] = useState(false);
  const [assignmentProjectFilter, setAssignmentProjectFilter] = useState('');
  const [assignmentClientFilter, setAssignmentClientFilter] = useState('');
  const [showAssignmentUsers, setShowAssignmentUsers] = useState(false);
  const [externalVmRows, setExternalVmRows] = useState<SuperAdminExternalVmOverviewRow[]>([]);
  const [selectedAssignmentVmIds, setSelectedAssignmentVmIds] = useState<string[]>([]);
  const [bulkOverrideOpen, setBulkOverrideOpen] = useState(false);
  const [manageRow, setManageRow] = useState<SuperAdminExternalVmOverviewRow | null>(null);
  const [deletingAssignmentVmId, setDeletingAssignmentVmId] = useState<string | null>(null);
  const [lockingVmId, setLockingVmId] = useState<string | null>(null);
  const [freeingVmInventoryId, setFreeingVmInventoryId] = useState<string | null>(null);
  const [resetingVmInventoryId, setResetingVmInventoryId] = useState<string | null>(null);
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [importingProviderMeta, setImportingProviderMeta] = useState(false);
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const resetSseRef = useRef<(() => void) | null>(null);
  const resetStatesRef = useRef<Map<string, 'pending' | 'resetting' | 'success' | 'failed' | 'offline'>>(new Map());
  const [resetProgressModalOpen, setResetProgressModalOpen] = useState(false);
  const [resetMachineStatuses, setResetMachineStatuses] = useState<ResetMachineStatus[]>([]);
  const [resetProgressData, setResetProgressData] = useState<{ acceptedCount: number; offlineCount: number; isStreaming: boolean }>({
    acceptedCount: 0,
    offlineCount: 0,
    isStreaming: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (options?: { page?: number; limit?: number }) => {
    setLoading(true);
    setError(null);
    try {
      if (showAssignmentView) {
        const overviewRows = await fetchSuperAdminExternalVmOverview();
        setExternalVmRows(overviewRows);
        setOwnerOptions(buildOwnerOptionsFromOverview(overviewRows));
        setItems([]);
        setTotal(overviewRows.length);
        return;
      }

      const requestedPage = options?.page ?? page;
      const requestedLimit = options?.limit ?? limit;
      const result = await fetchSuperAdminVmInventory({
        resourceType: resourceType || undefined,
        ownerScope: ownerScope || undefined,
        originServiceKey: serviceKey || undefined,
        status: status || undefined,
        search: debouncedSearch || undefined,
        ownerSearch: selectedOwner || undefined,
        sortBy,
        sortDirection,
        page: requestedPage,
        limit: requestedLimit,
      });
      setItems(result.items);
      setOwnerOptions(result.owners);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VM inventory.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, limit, ownerScope, page, resourceType, selectedOwner, serviceKey, showAssignmentView, sortBy, sortDirection, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const currentIds = new Set(items.map((item) => item.inventoryId));
    setSelectedInventoryIds((prev) => prev.filter((id) => currentIds.has(id)));
  }, [items]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const filteredOverviewRows = useMemo(() => {
    if (!showAssignmentView) return [];
    let rows = externalVmRows;
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      rows = rows.filter((row) => {
        const haystack = [
          row.ipAddress,
          row.name,
          row.tenantName,
          row.tenantSlug,
          row.adminEmail,
          ...row.assignments.map((assignment) => assignment.email ?? assignment.username ?? ''),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    }
    if (selectedOwner.trim()) {
      rows = rows.filter((row) => matchesOverviewOwnerFilter(row, selectedOwner));
    }
    return rows;
  }, [debouncedSearch, externalVmRows, selectedOwner, showAssignmentView]);

  const assignmentRows = useMemo(
    () => (showAssignmentView ? buildAssignmentRowsFromOverview(filteredOverviewRows) : buildAssignmentRows(items)),
    [filteredOverviewRows, items, showAssignmentView]
  );
  const manageIpRows = useMemo(() => {
    if (!manageRow) return [];
    const ip = manageRow.ipAddress.trim().toLowerCase();
    const matches = externalVmRows.filter((item) => item.ipAddress.trim().toLowerCase() === ip);
    return matches.length > 0 ? matches : [manageRow];
  }, [externalVmRows, manageRow]);
  const assignmentProjectOptions = useMemo(() => {
    const projects = new Set<string>();
    for (const row of assignmentRows) {
      for (const project of row.projectNames) {
        const trimmed = project.trim();
        if (trimmed) projects.add(trimmed);
      }
    }
    return [...projects].sort((a, b) => a.localeCompare(b));
  }, [assignmentRows]);
  const assignmentClientOptions = useMemo(() => {
    const clients = new Set<string>();
    for (const row of assignmentRows) {
      for (const client of row.clientNames) {
        const trimmed = client.trim();
        if (trimmed) clients.add(trimmed);
      }
    }
    return [...clients].sort((a, b) => a.localeCompare(b));
  }, [assignmentRows]);
  const filteredAssignmentRows = useMemo(() => {
    return assignmentRows.filter((row) => {
      const projectMatches =
        !assignmentProjectFilter || row.projectNames.includes(assignmentProjectFilter);
      const clientMatches =
        !assignmentClientFilter || row.clientNames.includes(assignmentClientFilter);
      return projectMatches && clientMatches;
    });
  }, [assignmentRows, assignmentProjectFilter, assignmentClientFilter]);
  const assignmentPageSize = 100;
  const assignmentTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredAssignmentRows.length / assignmentPageSize)),
    [filteredAssignmentRows.length]
  );
  const sortedAssignmentRows = useMemo(
    () => sortAssignmentRows(filteredAssignmentRows, assignmentSortBy, assignmentSortDirection),
    [filteredAssignmentRows, assignmentSortBy, assignmentSortDirection]
  );
  const paginatedAssignmentRows = useMemo(() => {
    const safePage = Math.min(Math.max(assignmentPage, 1), assignmentTotalPages);
    const start = (safePage - 1) * assignmentPageSize;
    return sortedAssignmentRows.slice(start, start + assignmentPageSize);
  }, [assignmentPage, assignmentTotalPages, sortedAssignmentRows]);
  const externalVmById = useMemo(
    () => new Map(externalVmRows.map((row) => [row.externalVmId, row] as const)),
    [externalVmRows]
  );

  useEffect(() => {
    setAssignmentPage((current) => Math.min(current, assignmentTotalPages));
  }, [assignmentTotalPages]);

  useEffect(() => {
    const validIds = new Set(
      filteredAssignmentRows
        .map((row) => row.editableExternalVmId)
        .filter((value): value is string => Boolean(value))
    );
    setSelectedAssignmentVmIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [filteredAssignmentRows]);

  const handleEditAssignmentRow = useCallback(
    async (row: AssignmentRow) => {
      let overviewRows = externalVmRows;
      let target = resolveOverviewRowForManage(row, overviewRows);

      if (!target || (row.assignments.length > 0 && target.assignments.length === 0)) {
        overviewRows = await fetchSuperAdminExternalVmOverview();
        setExternalVmRows(overviewRows);
        target = resolveOverviewRowForManage(row, overviewRows);
      }

      if (target) {
        setManageRow(target);
      }
    },
    [externalVmRows]
  );

  const performDeleteAssignmentRow = useCallback(
    async (row: AssignmentRow) => {
      const externalVmId = row.editableExternalVmId;
      if (!externalVmId) return;
      if (row.inventoryLocked) {
        setFlashMessage({ type: 'error', text: 'Unlock this VM before deleting it from inventory.' });
        return;
      }
      const vmLabel = row.vmNames[0] || row.ipAddress || 'this VM';

      setDeletingAssignmentVmId(externalVmId);
      setFlashMessage(null);
      try {
        await deleteSuperAdminExternalVm(externalVmId);
        setFlashMessage({ type: 'success', text: `Deleted ${vmLabel}.` });
        await load({ page: 1 });
      } catch (deleteError) {
        setFlashMessage({
          type: 'error',
          text: deleteError instanceof ApiError ? deleteError.message : 'Failed to delete VM.',
        });
      } finally {
        setDeletingAssignmentVmId(null);
      }
    },
    [load]
  );

  const handleDeleteAssignmentRow = useCallback((row: AssignmentRow) => {
    if (row.inventoryLocked) {
      setFlashMessage({ type: 'error', text: 'Unlock this VM before deleting it from inventory.' });
      return;
    }
    const vmLabel = row.vmNames[0] || row.ipAddress || 'this VM';
    setConfirmDialog({
      kind: 'deleteAssignmentVm',
      row,
      vmLabel,
      message: `Delete ${vmLabel}? This removes the VM record and assignments.`,
    });
  }, []);

  const handleToggleAssignmentLock = useCallback(
    async (row: AssignmentRow) => {
      const externalVmId = row.editableExternalVmId;
      if (!externalVmId) return;
      const nextLocked = !row.inventoryLocked;
      setLockingVmId(externalVmId);
      setFlashMessage(null);
      try {
        const result = await setSuperAdminExternalVmInventoryLock(externalVmId, nextLocked);
        setExternalVmRows((prev) =>
          prev.map((item) =>
            item.externalVmId === result.externalVmId
              ? { ...item, inventoryLocked: result.inventoryLocked }
              : item
          )
        );
        setFlashMessage({
          type: 'success',
          text: result.inventoryLocked
            ? 'VM locked. It cannot be deleted from inventory until unlocked.'
            : 'VM unlocked.',
        });
      } catch (err) {
        setFlashMessage({
          type: 'error',
          text: err instanceof ApiError ? err.message : 'Failed to update VM lock.',
        });
      } finally {
        setLockingVmId(null);
      }
    },
    []
  );

  const handleToggleAssignmentRowSelection = useCallback((externalVmId: string, checked: boolean) => {
    setSelectedAssignmentVmIds((prev) => {
      if (checked) {
        return prev.includes(externalVmId) ? prev : [...prev, externalVmId];
      }
      return prev.filter((id) => id !== externalVmId);
    });
  }, []);

  const handleToggleAssignmentPageSelection = useCallback((checked: boolean) => {
    const pageIds = paginatedAssignmentRows
      .map((row) => row.editableExternalVmId)
      .filter((value): value is string => Boolean(value));

    setSelectedAssignmentVmIds((prev) => {
      if (checked) {
        return [...new Set([...prev, ...pageIds])];
      }
      return prev.filter((id) => !pageIds.includes(id));
    });
  }, [paginatedAssignmentRows]);

  const handleBulkDeleteSelectedAssignmentVms = useCallback(() => {
    if (selectedAssignmentVmIds.length === 0) return;
    const lockedIdSet = new Set(
      externalVmRows.filter((row) => row.inventoryLocked).map((row) => row.externalVmId)
    );
    const unlockedIds = selectedAssignmentVmIds.filter((id) => !lockedIdSet.has(id));
    const lockedCount = selectedAssignmentVmIds.length - unlockedIds.length;
    if (unlockedIds.length === 0) {
      setFlashMessage({
        type: 'error',
        text: 'Unlock selected VMs before deleting them from inventory.',
      });
      return;
    }
    setConfirmDialog({
      kind: 'bulkDeleteAssignmentVms',
      externalVmIds: unlockedIds,
      message:
        lockedCount > 0
          ? `Delete ${unlockedIds.length} unlocked VM(s)? ${lockedCount} locked VM(s) will be skipped.`
          : `Delete ${unlockedIds.length} selected VM(s)? This removes the VM records and assignments.`,
    });
  }, [externalVmRows, selectedAssignmentVmIds]);

  const handleBulkGrantOverride = useCallback(() => {
    if (selectedAssignmentVmIds.length === 0) return;
    setBulkOverrideOpen(true);
  }, [selectedAssignmentVmIds]);

  const selectedHaveActiveOverride = useMemo(() => {
    const idSet = new Set(selectedAssignmentVmIds);
    return externalVmRows.some(
      (row) => idSet.has(row.externalVmId) && hasActiveAssignmentOverride(row)
    );
  }, [externalVmRows, selectedAssignmentVmIds]);

  const saveBulkOverride = useCallback(
    async (payload: AccessOverridePayload) => {
      if (selectedAssignmentVmIds.length === 0) return;
      setBulkActionBusy(true);
      setFlashMessage(null);
      try {
        const result = await bulkUpdateSuperAdminExternalVmOverride(selectedAssignmentVmIds, payload);
        const failedCount = result.notFound.length;
        setFlashMessage({
          type: failedCount > 0 && result.updatedVms === 0 ? 'error' : 'success',
          text: payload.accessOverride
            ? `Override granted for ${result.updatedVms} VM(s)` +
              (result.updatedAssignments > 0 ? ` (${result.updatedAssignments} assignment${result.updatedAssignments === 1 ? '' : 's'}).` : '.') +
              (failedCount > 0 ? ` ${failedCount} not found.` : '')
            : `Override revoked for ${result.updatedVms} VM(s)` +
              (failedCount > 0 ? ` ${failedCount} not found.` : '.'),
        });
        setBulkOverrideOpen(false);
        await load();
      } catch (err) {
        setFlashMessage({
          type: 'error',
          text: err instanceof ApiError ? err.message : 'Failed to update access override.',
        });
        throw err;
      } finally {
        setBulkActionBusy(false);
      }
    },
    [load, selectedAssignmentVmIds]
  );

  const performBulkDeleteAssignmentRows = useCallback(
    async (externalVmIds: string[]) => {
      if (externalVmIds.length === 0) return;
      setBulkActionBusy(true);
      setFlashMessage(null);
      let successCount = 0;
      let failedCount = 0;

      try {
        const result = await bulkDeleteSuperAdminExternalVms(externalVmIds);
        successCount = result.summary.deleted;
        failedCount = result.summary.failed;
      } catch {
        failedCount = externalVmIds.length;
      }

      setSelectedAssignmentVmIds([]);
      await load({ page: 1 });
      setFlashMessage({
        type: failedCount > 0 ? 'error' : 'success',
        text: `VM delete completed. Success: ${successCount}, Failed: ${failedCount}.`,
      });
      setBulkActionBusy(false);
    },
    [load]
  );

  const performFreeVmAndDeleteUser = useCallback(
    async (item: SuperAdminVmInventoryItem) => {
      if (!canFreeVmInventoryRow(item)) return;
      const vmLabel = item.name || item.ipAddress || 'this VM';

      setFreeingVmInventoryId(item.inventoryId);
      setFlashMessage(null);
      try {
        const result = await freeSuperAdminVmInventoryAndDeleteUser({
          resourceType: item.resourceType,
          sourceId: item.sourceId,
        });
        if (!result.updated) {
          setFlashMessage({ type: 'success', text: `${vmLabel} is already free.` });
          await load();
          return;
        }

        const deletedUsersCount = result.deletedPlatformUsers + result.deletedTenantUsers;
        const detailParts: string[] = [];
        if (deletedUsersCount > 0) {
          detailParts.push(
            `deleted ${deletedUsersCount} login account${deletedUsersCount > 1 ? 's' : ''}`
          );
        }
        if (result.clearedAssignment) {
          detailParts.push('end-user unassigned from VM');
        }
        if (result.clearedOwner) {
          detailParts.push('moved to free pool (detached from tenant/admin)');
        }

        const detail = detailParts.length > 0 ? ` ${detailParts.join(', ')}.` : ' VM is now free.';
        setFlashMessage({
          type: 'success',
          text: `${vmLabel} is free.${detail} Use owner filter "Unassigned" to find it in assignment view.`,
        });
        await load();
      } catch (freeError) {
        setFlashMessage({
          type: 'error',
          text: freeError instanceof ApiError ? freeError.message : 'Failed to delete user and free VM.',
        });
      } finally {
        setFreeingVmInventoryId(null);
      }
    },
    [load]
  );

  const handleFreeVmAndDeleteUser = useCallback((item: SuperAdminVmInventoryItem) => {
    if (!canFreeVmInventoryRow(item)) return;
    const vmLabel = item.name || item.ipAddress || 'this VM';
    setConfirmDialog({
      kind: 'freeVmAndDeleteUser',
      item,
      vmLabel,
      message: `Delete user & free ${vmLabel}? This deletes the end-user account, unassigns them from the VM, and detaches the VM from its tenant/admin owner so it returns to the free pool.`,
    });
  }, []);

  const handleResetMachine = useCallback((item: SuperAdminVmInventoryItem) => {
    const vmLabel = item.name || item.ipAddress || 'this VM';
    setConfirmDialog({
      kind: 'resetMachine',
      item,
      vmLabel,
      message: `Reset ${vmLabel}? All user software, credentials, activity traces, and system cache will be removed.`,
    });
  }, []);

  const handleToggleInventorySelection = useCallback((item: SuperAdminVmInventoryItem, checked: boolean) => {
    setSelectedInventoryIds((prev) => {
      if (checked) {
        return prev.includes(item.inventoryId) ? prev : [...prev, item.inventoryId];
      }
      return prev.filter((id) => id !== item.inventoryId);
    });
  }, []);

  const handleToggleAllInventorySelection = useCallback((checked: boolean) => {
    if (!checked) {
      setSelectedInventoryIds([]);
      return;
    }
    const selectableIds = items
      .filter((item) => Boolean(item.inventoryId))
      .map((item) => item.inventoryId);
    setSelectedInventoryIds(selectableIds);
  }, [items]);

  const handleBulkFreeVmAndDeleteUser = useCallback(() => {
    if (selectedInventoryIds.length === 0) return;
    setConfirmDialog({
      kind: 'bulkFreeVmAndDeleteUser',
      inventoryIds: [...selectedInventoryIds],
      message: `Delete user & free ${selectedInventoryIds.length} selected VM(s)? End users are deleted, VMs are unassigned, and detached from tenant/admin owners into the free pool.`,
    });
  }, [selectedInventoryIds]);

  const handleBulkResetMachines = useCallback(() => {
    if (selectedInventoryIds.length === 0) return;
    setConfirmDialog({
      kind: 'bulkResetMachines',
      inventoryIds: [...selectedInventoryIds],
      message: `Reset ${selectedInventoryIds.length} selected VM(s)? All user software, credentials, activity traces, and system cache will be removed from each.`,
    });
  }, [selectedInventoryIds]);

  const performBulkFreeVmAndDeleteUser = useCallback(
    async (inventoryIds: string[]) => {
      const rows = items.filter((item) => inventoryIds.includes(item.inventoryId));
      if (rows.length === 0) return;
      setBulkActionBusy(true);
      setFlashMessage(null);
      let successCount = 0;
      let failedCount = 0;
      for (const item of rows) {
        try {
          const result = await freeSuperAdminVmInventoryAndDeleteUser({
            resourceType: item.resourceType,
            sourceId: item.sourceId,
          });
          if (result.updated) successCount += 1;
          else failedCount += 1;
        } catch {
          failedCount += 1;
        }
      }
      setSelectedInventoryIds([]);
      await load();
      setFlashMessage({
        type: failedCount > 0 ? 'error' : 'success',
        text: `Delete user & make VM free completed. Success: ${successCount}, Failed: ${failedCount}.`,
      });
      setBulkActionBusy(false);
    },
    [items, load]
  );

  const performResetMachine = useCallback(
    async (item: SuperAdminVmInventoryItem) => {
      if (!item.inventoryId) return;
      setResetingVmInventoryId(item.inventoryId);
      setFlashMessage(null);
      try {
        const sessionId = Date.now().toString();
        const result = await superAdminResetMachinesByInventory([item.inventoryId], sessionId);

        const vmLabel = item.name || item.ipAddress || item.inventoryId;
        const notFound = result.notFound.includes(item.inventoryId);
        const initialStatus: ResetMachineStatus['status'] = notFound
          ? 'offline'
          : result.accepted.length > 0
            ? 'pending'
            : result.offline.length > 0
              ? 'offline'
              : 'offline';

        setResetMachineStatuses([
          {
            inventoryId: item.inventoryId,
            vmLabel,
            status: initialStatus,
            error: notFound ? 'No machine agent found for this VM.' : undefined,
          },
        ]);
        setResetProgressData({
          acceptedCount: result.accepted.length,
          offlineCount: result.offline.length + result.notFound.length,
          isStreaming: result.accepted.length > 0,
        });
        setResetProgressModalOpen(true);

        if (result.accepted.length === 0) {
          return;
        }

        resetStatesRef.current.clear();
        const ticketResponse = await superAdminIssueResetStreamTicket(sessionId);

        const stopStream = await superAdminOpenResetStatusStreamWithReconnect(
          sessionId,
          ticketResponse.streamToken,
          (event) => {
            if (event.type === 'reset_complete' && event.machineId) {
              setResetMachineStatuses((prev) =>
                prev.map((m) =>
                  m.inventoryId === item.inventoryId
                    ? {
                        ...m,
                        status: event.success ? 'success' : 'failed',
                        error: event.error,
                        completedAt: Date.now(),
                      }
                    : m
                )
              );
            }
          },
          () => {
            setResetProgressData((prev) => ({ ...prev, isStreaming: false }));
          },
          () => {
            setResetProgressData((prev) => ({ ...prev, isStreaming: false }));
            setResetMachineStatuses((prev) =>
              prev.map((m) =>
                m.status === 'pending'
                  ? {
                      ...m,
                      status: 'failed',
                      error: 'Connection lost — reset may have completed. Check the machine status.',
                    }
                  : m
              )
            );
          },
          result.accepted.length
        );

        resetSseRef.current = stopStream;
        setTimeout(() => {
          void load();
        }, 3000);
      } catch (err) {
        const errorMsg = err instanceof ApiError ? err.message : 'Failed to reset machine';
        setFlashMessage({
          type: 'error',
          text: errorMsg,
        });
        setResetProgressData((prev) => ({ ...prev, isStreaming: false }));
      } finally {
        setResetingVmInventoryId(null);
      }
    },
    [load]
  );

  const performBulkResetMachines = useCallback(
    async (inventoryIds: string[]) => {
      if (inventoryIds.length === 0) return;
      setBulkActionBusy(true);
      setFlashMessage(null);
      try {
        const sessionId = Date.now().toString();
        const result = await superAdminResetMachinesByInventory(inventoryIds, sessionId);

        const machineStatuses: ResetMachineStatus[] = inventoryIds.map((invId) => {
          const item = items.find((i) => i.inventoryId === invId);
          const vmLabel = item?.name || item?.ipAddress || invId;
          const notFound = result.notFound.includes(invId);
          return {
            inventoryId: invId,
            vmLabel,
            status: notFound ? 'offline' : result.accepted.length > 0 ? 'pending' : 'offline',
            error: notFound
              ? 'No machine agent found for this VM.'
              : result.accepted.length === 0
                ? 'Machine agent is offline.'
                : undefined,
          };
        });

        setResetMachineStatuses(machineStatuses);
        setResetProgressData({
          acceptedCount: result.accepted.length,
          offlineCount: result.offline.length + result.notFound.length,
          isStreaming: result.accepted.length > 0,
        });
        setResetProgressModalOpen(true);

        resetStatesRef.current.clear();

        if (result.accepted.length === 0) {
          setSelectedInventoryIds([]);
          return;
        }

        const ticketResponse = await superAdminIssueResetStreamTicket(sessionId);

        const markRemainingPendingOffline = () => {
          setResetMachineStatuses((prev) =>
            prev.map((m) =>
              m.status === 'pending'
                ? {
                    ...m,
                    status: 'offline',
                    error: 'Machine agent is offline or reset was skipped.',
                  }
                : m
            )
          );
        };

        const stopStream = await superAdminOpenResetStatusStreamWithReconnect(
          sessionId,
          ticketResponse.streamToken,
          (event) => {
            if (event.type === 'reset_complete' && event.machineId) {
              setResetMachineStatuses((prev) => {
                const nextPendingIndex = prev.findIndex((m) => m.status === 'pending');
                if (nextPendingIndex === -1) return prev;
                return prev.map((m, idx) =>
                  idx === nextPendingIndex
                    ? {
                        ...m,
                        status: event.success ? 'success' : 'failed',
                        error: event.error,
                        completedAt: Date.now(),
                      }
                    : m
                );
              });
            }
          },
          () => {
            setResetProgressData((prev) => ({ ...prev, isStreaming: false }));
            markRemainingPendingOffline();
          },
          () => {
            setResetProgressData((prev) => ({ ...prev, isStreaming: false }));
            setResetMachineStatuses((prev) =>
              prev.map((m) =>
                m.status === 'pending'
                  ? {
                      ...m,
                      status: 'failed',
                      error: 'Connection lost — reset may have completed. Check the machine status.',
                    }
                  : m
              )
            );
          },
          result.accepted.length
        );

        resetSseRef.current = stopStream;
        setSelectedInventoryIds([]);
        setTimeout(() => {
          void load();
        }, 3000);
      } catch (err) {
        const errorMsg = err instanceof ApiError ? err.message : 'Failed to reset machines';
        setFlashMessage({
          type: 'error',
          text: errorMsg,
        });
        setResetProgressData((prev) => ({ ...prev, isStreaming: false }));
      } finally {
        setBulkActionBusy(false);
      }
    },
    [items, load]
  );

  const handleConfirmDialog = useCallback(async () => {
    if (!confirmDialog) return;

    if (confirmDialog.kind === 'freeVmAndDeleteUser') {
      await performFreeVmAndDeleteUser(confirmDialog.item);
      setConfirmDialog(null);
      return;
    }

    if (confirmDialog.kind === 'resetMachine') {
      await performResetMachine(confirmDialog.item);
      setConfirmDialog(null);
      return;
    }

    if (confirmDialog.kind === 'bulkFreeVmAndDeleteUser') {
      await performBulkFreeVmAndDeleteUser(confirmDialog.inventoryIds);
      setConfirmDialog(null);
      return;
    }

    if (confirmDialog.kind === 'bulkResetMachines') {
      await performBulkResetMachines(confirmDialog.inventoryIds);
      setConfirmDialog(null);
      return;
    }

    if (confirmDialog.kind === 'bulkDeleteAssignmentVms') {
      await performBulkDeleteAssignmentRows(confirmDialog.externalVmIds);
      setConfirmDialog(null);
      return;
    }

    if (confirmDialog.kind === 'deleteAssignmentVm') {
      await performDeleteAssignmentRow(confirmDialog.row);
      setConfirmDialog(null);
      return;
    }
  }, [confirmDialog, performBulkFreeVmAndDeleteUser, performBulkResetMachines, performBulkDeleteAssignmentRows, performFreeVmAndDeleteUser, performResetMachine, performDeleteAssignmentRow]);

  const confirmDialogBusy =
    confirmDialog?.kind === 'freeVmAndDeleteUser'
      ? freeingVmInventoryId === confirmDialog.item.inventoryId
      : confirmDialog?.kind === 'resetMachine'
        ? resetingVmInventoryId === confirmDialog.item.inventoryId
      : confirmDialog?.kind === 'bulkFreeVmAndDeleteUser' || confirmDialog?.kind === 'bulkDeleteAssignmentVms' || confirmDialog?.kind === 'bulkResetMachines'
        ? bulkActionBusy
      : confirmDialog?.kind === 'deleteAssignmentVm'
      ? deletingAssignmentVmId === confirmDialog.row.editableExternalVmId
        : false;

  const toggleSort = (nextSortBy: SortBy) => {
    if (sortBy === nextSortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(nextSortBy);
      setSortDirection(nextSortBy === 'createdAt' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const toggleAssignmentSort = (nextSortBy: AssignmentSortBy) => {
    if (assignmentSortBy === nextSortBy) {
      setAssignmentSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setAssignmentSortBy(nextSortBy);
      setAssignmentSortDirection('asc');
    }
    setAssignmentPage(1);
  };

  const handleProviderMetadataUpload = async (file: File) => {
    setImportingProviderMeta(true);
    setFlashMessage(null);
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true, cellNF: false, cellText: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
      const formattedRows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: false,
        dateNF: 'yyyy-mm-dd',
      }) as Record<string, unknown>[];
      const grid = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: false,
        dateNF: 'yyyy-mm-dd',
      }) as unknown[][];
      const headerRow = (grid[0] ?? []).map((cell) => String(cell ?? '').trim());
      const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const findDateColumn = (aliases: string[]) => {
        const normalizedAliases = aliases.map(normalizeHeader);
        return headerRow.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
      };
      const startDateCol = findDateColumn(PROVIDER_START_DATE_HEADERS);
      const endDateCol = findDateColumn(PROVIDER_END_DATE_HEADERS);
      const unparsedStartSamples: string[] = [];
      const unparsedEndSamples: string[] = [];
      let missingIpCount = 0;
      let missingStartCount = 0;
      let missingEndCount = 0;
      let unparsedStartCount = 0;
      let unparsedEndCount = 0;
      let invalidDurationCount = 0;

      const parsedRows: VmProviderMetadataImportRow[] = [];
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index] ?? {};
        const formattedRow = formattedRows[index] ?? {};
        const gridRow = grid[index + 1] ?? [];
        const excelRow = index + 2;
          const ipAddress = normalizeIpCell(readCell(row, ['IP', 'Ip', 'IP Address', 'Ip Address', 'ip', 'ipAddress']));
          const name = String(readCell(row, ['Name', 'Server Name', 'VM Name', 'Hostname', 'Host Name', 'name']) ?? '').trim();
          const vmSpec = String(
            readCell(row, [
              'VM Spec',
              'VM Specs',
              'Vm Spec',
              'Vp Spec',
              'VPS Spec',
              'Server Spec',
              'Instance Type',
              'Instance Spec',
              'Configuration',
              'VM Configuration',
              'Package',
              'Plan Spec',
              'Spec',
              'Specs',
              'vmSpec',
            ]) ?? ''
          ).trim();
          const rawProtocol = String(readCell(row, ['Protocol', 'protocol']) ?? '').trim().toLowerCase();
          const rawDuration = String(
            readCell(row, [
              'Plan Duration',
              'Plan Durat',
              'Plan Dura',
              'Duration',
              'Billing Period',
              'planDuration',
            ]) ?? ''
          ).trim().toLowerCase();
          const username = String(readCell(row, ['Username', 'User Name', 'username']) ?? '').trim();
          const password = String(readCell(row, ['Password', 'password']) ?? '').trim();
          const startRaw =
            (startDateCol >= 0 ? gridRow[startDateCol] : undefined) ??
            readCell(formattedRow, PROVIDER_START_DATE_HEADERS) ??
            readCell(row, PROVIDER_START_DATE_HEADERS);
          const endRaw =
            (endDateCol >= 0 ? gridRow[endDateCol] : undefined) ??
            readCell(formattedRow, PROVIDER_END_DATE_HEADERS) ??
            readCell(row, PROVIDER_END_DATE_HEADERS);
          const providerStartDate = normalizeDateCell(startRaw);
          const providerEndDate = normalizeDateCell(endRaw);

          if (!ipAddress) {
            missingIpCount += 1;
            continue;
          }

          if (!cellHasValue(startRaw)) missingStartCount += 1;
          else if (!providerStartDate) {
            unparsedStartCount += 1;
            if (unparsedStartSamples.length < 8) {
              unparsedStartSamples.push(`Row ${excelRow} (IP ${ipAddress}): "${formatCellSample(startRaw)}"`);
            }
          }
          if (!cellHasValue(endRaw)) missingEndCount += 1;
          else if (!providerEndDate) {
            unparsedEndCount += 1;
            if (unparsedEndSamples.length < 8) {
              unparsedEndSamples.push(`Row ${excelRow} (IP ${ipAddress}): "${formatCellSample(endRaw)}"`);
            }
          }

          const protocol: VmProviderMetadataImportRow['protocol'] =
            rawProtocol === 'rdp' || rawProtocol === 'ssh' ? rawProtocol : undefined;

          let planDuration: VmProviderMetadataImportRow['planDuration'];
          if (rawDuration === 'monthly' || rawDuration === 'month' || rawDuration === 'mon') planDuration = 'monthly';
          else if (rawDuration === 'quarterly' || rawDuration === 'quarter' || rawDuration === 'qtr') planDuration = 'quarterly';
          else if (rawDuration === 'hourly' || rawDuration === 'hour' || rawDuration === 'hr') planDuration = 'hourly';
          else if (rawDuration === 'yearly' || rawDuration === 'year' || rawDuration === 'yr') planDuration = 'yearly';
          else if (rawDuration) invalidDurationCount += 1;

          parsedRows.push({
            ipAddress,
            name: name || undefined,
            vmSpec: vmSpec || undefined,
            protocol,
            planDuration,
            username: username || undefined,
            password: password || undefined,
            providerStartDate,
            providerEndDate,
          });
      }

      if (parsedRows.length === 0) {
        const skippedHint = missingIpCount > 0
          ? ` ${missingIpCount} row(s) were skipped because they had no IP. Use an "IP" or "IP Address" column.`
          : '';
        setFlashMessage({ type: 'error', text: `No valid Excel rows found.${skippedHint}` });
        return;
      }

      const datedRows = parsedRows.filter((row) => row.providerStartDate || row.providerEndDate).length;
      const result = await importVmProviderMetadata(parsedRows);

      const report: string[] = [
        `Imported provider metadata for ${result.updated} of ${result.total} row(s)${result.created > 0 ? ` and created ${result.created} new VM record(s)` : ''}.`,
        `Provider dates updated for ${datedRows} of ${parsedRows.length} row(s).`,
      ];
      if (startDateCol < 0) {
        report.push('No Start Date column found. Add "Start Date" or "Provider Start Date".');
      }
      if (endDateCol < 0) {
        report.push('No End Date column found. Add "End Date" or "Provider End Date".');
      }
      if (missingIpCount > 0) {
        report.push(`${missingIpCount} row(s) skipped because IP was missing or empty.`);
      }
      if (unparsedStartCount > 0) {
        report.push(`${unparsedStartCount} start date(s) were not in a supported format. ${DATE_FORMAT_HINT}`);
        report.push(...unparsedStartSamples.map((sample) => `• ${sample}`));
      }
      if (unparsedEndCount > 0) {
        report.push(`${unparsedEndCount} end date(s) were not in a supported format. ${DATE_FORMAT_HINT}`);
        report.push(...unparsedEndSamples.map((sample) => `• ${sample}`));
      }
      if (missingStartCount > 0 && startDateCol >= 0) {
        report.push(`${missingStartCount} row(s) had an empty Start Date.`);
      }
      if (missingEndCount > 0 && endDateCol >= 0) {
        report.push(`${missingEndCount} row(s) had an empty End Date.`);
      }
      if (invalidDurationCount > 0) {
        report.push(`${invalidDurationCount} Plan Duration value(s) were ignored. Use monthly, quarterly, hourly, or yearly.`);
      }

      const hasDateProblems =
        startDateCol < 0 ||
        endDateCol < 0 ||
        unparsedStartCount > 0 ||
        unparsedEndCount > 0 ||
        datedRows === 0;
      setFlashMessage({
        type: hasDateProblems ? 'warning' : 'success',
        text: report.join('\n'),
      });
      setShowAssignmentVmSpec(true);
      setPage(1);
      await load({ page: 1 });
    } catch (uploadError) {
      setFlashMessage({ type: 'error', text: uploadError instanceof ApiError ? uploadError.message : 'Failed to import provider metadata Excel.' });
    } finally {
      setImportingProviderMeta(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      {confirmDialog ? (
        <ConfirmActionModal
          message={confirmDialog.message}
          onConfirm={() => {
            void handleConfirmDialog();
          }}
          onCancel={() => {
            if (!confirmDialogBusy) setConfirmDialog(null);
          }}
          busy={confirmDialogBusy}
          confirmText={
            confirmDialog.kind === 'resetMachine' || confirmDialog.kind === 'bulkResetMachines'
              ? 'Resetting'
              : undefined
          }
        />
      ) : null}

      <ResetProgressModal
        isOpen={resetProgressModalOpen}
        machines={resetMachineStatuses}
        onClose={() => setResetProgressModalOpen(false)}
        isStreaming={resetProgressData.isStreaming}
        acceptedCount={resetProgressData.acceptedCount}
        offlineCount={resetProgressData.offlineCount}
      />

      {bulkOverrideOpen ? (
        <GrantAccessOverrideModal
          open
          vmName={`${selectedAssignmentVmIds.length} selected VM${selectedAssignmentVmIds.length === 1 ? '' : 's'}`}
          currentlyActive={selectedHaveActiveOverride}
          onClose={() => {
            if (!bulkActionBusy) setBulkOverrideOpen(false);
          }}
          onSave={saveBulkOverride}
        />
      ) : null}

      {manageRow ? (
        <ManageExternalVmAssignmentsModal
          row={manageRow}
          ipRows={manageIpRows}
          onClose={() => setManageRow(null)}
          onUpdated={(updated) => {
            setExternalVmRows((prev) => {
              const exists = prev.some((item) => item.externalVmId === updated.externalVmId);
              if (exists) {
                return prev.map((item) => (item.externalVmId === updated.externalVmId ? updated : item));
              }
              return [...prev, updated];
            });
            setManageRow((current) =>
              current?.externalVmId === updated.externalVmId ? updated : current
            );
            void load();
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/super-admin-console" className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
            <ChevronLeft className="h-4 w-4" /> All services
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">VM Inventory</h1>
          <p className="mt-0.5 text-sm text-gray-500">Unique VM list across VPS, VM Catalog, and External VM Import.</p>
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleProviderMetadataUpload(file);
            }}
          />
          {showAssignmentView ? (
            <button type="button" disabled={importingProviderMeta} onClick={() => uploadInputRef.current?.click()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
              <Upload className="h-4 w-4" />
              {importingProviderMeta ? 'Importing provider Excel…' : 'Upload provider Excel'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {flashMessage ? (
          <div className={`mb-3 whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm ${
            flashMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : flashMessage.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}>
            {flashMessage.text}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[16rem] max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClass} pl-9`} placeholder="Search name, IP, owner..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {showAssignmentView && ownerOptions.length > 0 ? (
            <select
              value={selectedOwner}
              onChange={(e) => {
                setSelectedOwner(e.target.value);
                setAssignmentPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">All owners</option>
              {ownerOptions.map((owner) => (
                <option key={owner.label} value={owner.label}>
                  {owner.label} ({owner.count})
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" onClick={() => setShowAssignmentView((prev) => !prev)} className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            {showAssignmentView ? 'Inventory records view' : 'VM assignment view'}
          </button>
        </div>
      </div>

      {!showAssignmentView ? (
        <InventoryTable
          items={items}
          ownerOptions={ownerOptions}
          selectedOwner={selectedOwner}
          onSelectedOwnerChange={(value) => {
            setSelectedOwner(value);
            setPage(1);
          }}
          serviceKey={serviceKey}
          onServiceKeyChange={(value) => {
            setServiceKey(value);
            setPage(1);
          }}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onToggleSort={toggleSort}
          total={total}
          page={page}
          totalPages={totalPages}
          limit={limit}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
          onPreviousPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
          freeingVmInventoryId={freeingVmInventoryId}
          resetingVmInventoryId={resetingVmInventoryId}
          selectedInventoryIds={selectedInventoryIds}
          onToggleInventorySelection={handleToggleInventorySelection}
          onToggleAllSelection={handleToggleAllInventorySelection}
          onBulkFreeVmAndDeleteUser={handleBulkFreeVmAndDeleteUser}
          onBulkResetMachines={handleBulkResetMachines}
          bulkBusy={bulkActionBusy}
          onFreeVmAndDeleteUser={handleFreeVmAndDeleteUser}
          onResetMachine={handleResetMachine}
          loading={loading}
          error={error}
          onRetry={() => void load()}
        />
      ) : null}

      {showAssignmentView && loading ? <TableSkeleton rows={8} cols={8} /> : null}

      {showAssignmentView && !loading && error ? (
        <div className="mt-6">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      ) : null}

      {showAssignmentView && !loading && !error && sortedAssignmentRows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-16 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <Database className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">No external VMs match the current search or owner filter.</p>
        </div>
      ) : null}

      {showAssignmentView && !loading && !error && sortedAssignmentRows.length > 0 ? (
        <AssignmentTable
          rows={paginatedAssignmentRows}
          page={assignmentPage}
          totalPages={assignmentTotalPages}
          totalVmCount={filteredAssignmentRows.length}
          totalExternalVmCount={filteredOverviewRows.length}
          selectedExternalVmIds={selectedAssignmentVmIds}
          showVmNames={showAssignmentVmNames}
          showProjects={showAssignmentProjects}
          showClients={showAssignmentClients}
          showVmSpec={showAssignmentVmSpec}
          showPlanDuration={showAssignmentPlanDuration}
          projectFilter={assignmentProjectFilter}
          projectOptions={assignmentProjectOptions}
          clientFilter={assignmentClientFilter}
          clientOptions={assignmentClientOptions}
          showUsers={showAssignmentUsers}
          sortBy={assignmentSortBy}
          sortDirection={assignmentSortDirection}
          onShowVmNames={() => setShowAssignmentVmNames(true)}
          onHideVmNames={() => setShowAssignmentVmNames(false)}
          onShowProjects={() => setShowAssignmentProjects(true)}
          onHideProjects={() => setShowAssignmentProjects(false)}
          onShowClients={() => setShowAssignmentClients(true)}
          onHideClients={() => setShowAssignmentClients(false)}
          onShowVmSpec={() => setShowAssignmentVmSpec(true)}
          onHideVmSpec={() => setShowAssignmentVmSpec(false)}
          onShowPlanDuration={() => setShowAssignmentPlanDuration(true)}
          onHidePlanDuration={() => setShowAssignmentPlanDuration(false)}
          onProjectFilterChange={setAssignmentProjectFilter}
          onClientFilterChange={setAssignmentClientFilter}
          onPreviousPage={() => setAssignmentPage((current) => Math.max(1, current - 1))}
          onNextPage={() => setAssignmentPage((current) => Math.min(assignmentTotalPages, current + 1))}
          onShowUsers={() => setShowAssignmentUsers(true)}
          onHideUsers={() => setShowAssignmentUsers(false)}
          onToggleSort={toggleAssignmentSort}
          onToggleRowSelection={handleToggleAssignmentRowSelection}
          onTogglePageSelection={handleToggleAssignmentPageSelection}
          onBulkGrantOverride={handleBulkGrantOverride}
          onBulkDeleteSelected={handleBulkDeleteSelectedAssignmentVms}
          onEditRow={handleEditAssignmentRow}
          onDeleteRow={handleDeleteAssignmentRow}
          onToggleLock={handleToggleAssignmentLock}
          deletingVmId={deletingAssignmentVmId}
          lockingVmId={lockingVmId}
          bulkDeleteBusy={bulkActionBusy}
        />
      ) : null}
    </div>
  );
}
