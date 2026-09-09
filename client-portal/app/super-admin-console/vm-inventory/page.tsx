'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserMinus,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  bulkDeleteInventoryServers,
  deleteInventoryServer,
  fetchInventoryFilterOptions,
  fetchVmInventory,
  type InventoryFilterOptions,
  revealCredentialPassword,
  setInventoryServerLock,
  SOURCE_LABELS,
  type InventorySource,
  type VmInventoryRow,
} from '@/lib/vmInventoryApi';
import { VmInventoryBulkOverrideModal } from '@/components/super-admin-console/vm-inventory/VmInventoryBulkOverrideModal';
import { VmInventoryBulkUnassignModal } from '@/components/super-admin-console/vm-inventory/VmInventoryBulkUnassignModal';
import { VmInventoryExpiryAlertsModal } from '@/components/super-admin-console/vm-inventory/VmInventoryExpiryAlertsModal';
import { VmInventoryImportModal } from '@/components/super-admin-console/vm-inventory/VmInventoryImportModal';
import { VmInventoryManageModal } from '@/components/super-admin-console/vm-inventory/VmInventoryManageModal';
import { VmInventoryResetModal } from '@/components/super-admin-console/vm-inventory/VmInventoryResetModal';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

const fmtDate = (iso: string | null): string => (iso ? iso.slice(0, 10) : '—');

/**
 * Why a row has no actions. VPS, catalog and dedicated machines are shown here
 * read-only: they live in their own subsystem, and deleting one from the
 * inventory would leave the real machine running with nothing tracking it.
 */
function ownedElsewhere(row: VmInventoryRow): string {
  const where = row.sources.map((s) => SOURCE_LABELS[s]).join(' / ');
  return `This VM is managed by ${where}. Delete or edit it there — the inventory only reads it.`;
}

/** Matches the "expiring soon" window used by projects and tenant plans. */
const EXPIRING_SOON_DAYS = 7;

/**
 * Whole days from today until `iso`, both normalized to their UTC calendar day
 * so the count always agrees with the date string rendered beside it.
 */
function daysUntil(iso: string): number | null {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((endDay - today) / 86_400_000);
}

const URGENT_TAG = 'bg-rose-50 text-rose-700 ring-rose-200';
const SOON_TAG = 'bg-amber-50 text-amber-700 ring-amber-200';

/** End date with a countdown tag once it falls inside the expiry window. */
function EndDate({ iso }: { iso: string | null }) {
  if (!iso) return <p className="text-xs text-gray-400">—</p>;

  const days = daysUntil(iso);
  let tag: { text: string; tone: string } | null = null;
  if (days !== null) {
    if (days < 0) tag = { text: 'expired', tone: URGENT_TAG };
    else if (days === 0) tag = { text: 'ends today', tone: URGENT_TAG };
    else if (days === 1) tag = { text: 'ends tomorrow', tone: SOON_TAG };
    else if (days <= EXPIRING_SOON_DAYS) tag = { text: `ends in ${days} days`, tone: SOON_TAG };
  }

  return (
    <div>
      <p className="text-xs text-gray-700">{iso.slice(0, 10)}</p>
      {tag && (
        <span
          className={`mt-1 inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tag.tone}`}
        >
          {tag.text}
        </span>
      )}
    </div>
  );
}

/** Columns hidden until the operator opts in, to keep the default table narrow. */
const OPTIONAL_COLUMNS = [
  { key: 'assignedUser', label: 'Assigned user' },
  { key: 'assignedAdmin', label: 'Assigned admin' },
  { key: 'clientName', label: 'Client name' },
  { key: 'projectName', label: 'Project name' },
] as const;

type OptionalColumnKey = (typeof OPTIONAL_COLUMNS)[number]['key'];

/** Always present: checkbox, IP, spec, username, password, 4 dates, action. */
const BASE_COLUMN_COUNT = 10;

/**
 * Compact dropdown that sits under a column's label in the table header, so a
 * column and the filter that narrows it stay together.
 */
function HeaderFilter({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  const active = value !== '';
  return (
    <select
      className={`mt-1.5 block w-full max-w-[190px] cursor-pointer rounded-md border bg-white px-1.5 py-1 text-[11px] font-normal normal-case tracking-normal focus:outline-none focus:ring-1 focus:ring-[#B91C1C]/30 disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? 'border-[#B91C1C] text-[#B91C1C]' : 'border-gray-200 text-gray-600'
      }`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Stacked cell — one line per credential, so a row stays one row per IP. */
function StackedCell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

export default function VmInventoryPage() {
  const [rows, setRows] = useState<VmInventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<InventorySource | ''>('');
  const [assigned, setAssigned] = useState<'' | 'assigned' | 'unassigned'>('');

  // Filters behind the optional columns. `owner` holds "admin:<id>"/"tenant:<id>"
  // so one dropdown can offer both kinds of owner.
  const [assigneeId, setAssigneeId] = useState('');
  const [owner, setOwner] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [vmSpec, setVmSpec] = useState('');
  const [filterOptions, setFilterOptions] = useState<InventoryFilterOptions | null>(null);

  /** Selected server IDs, kept across pages so a multi-page delete is possible. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [unassignOpen, setUnassignOpen] = useState(false);

  /** Optional columns are collapsed by default. */
  const [extraColumns, setExtraColumns] = useState<Set<OptionalColumnKey>>(new Set());

  /**
   * Each column's filter lives in its header, so hiding a column also drops its
   * filter — otherwise the table would stay narrowed by an invisible control.
   */
  const toggleExtraColumn = useCallback(
    (key: OptionalColumnKey) => {
      const hiding = extraColumns.has(key);
      setExtraColumns((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      if (hiding) {
        if (key === 'assignedUser') setAssigneeId('');
        else if (key === 'assignedAdmin') setOwner('');
        else if (key === 'clientName') setClientName('');
        else if (key === 'projectName') setProjectId('');
        setPage(1);
      }
    },
    [extraColumns]
  );

  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [manageRow, setManageRow] = useState<VmInventoryRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** Inventory-wide count, kept from the most recent unfiltered load. */
  const [unfilteredTotal, setUnfilteredTotal] = useState<number | null>(null);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Dropdown choices change only when the inventory itself does.
  useEffect(() => {
    const controller = new AbortController();
    fetchInventoryFilterOptions(controller.signal)
      .then(setFilterOptions)
      .catch(() => {
        // A failed options load only costs the dropdowns; the table still works.
      });
    return () => controller.abort();
  }, [reloadKey]);

  const ownerType = owner ? owner.slice(0, owner.indexOf(':')) : '';
  const ownerId = owner ? owner.slice(owner.indexOf(':') + 1) : '';

  /** Whether the request being sent narrows the inventory at all. */
  const queryFiltered = Boolean(
    search || source || assigned || assigneeId || clientName || projectId || vmSpec || owner
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchVmInventory(
      {
        page,
        pageSize,
        ...(search ? { search } : {}),
        ...(source ? { source } : {}),
        ...(assigned ? { assigned } : {}),
        ...(assigneeId ? { assigneeId } : {}),
        ...(clientName ? { clientName } : {}),
        ...(projectId ? { projectId } : {}),
        ...(vmSpec ? { vmSpec } : {}),
        ...(ownerType === 'admin' ? { adminId: ownerId } : {}),
        ...(ownerType === 'tenant' ? { tenantId: ownerId } : {}),
      },
      controller.signal
    )
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
        // An unfiltered load doubles as the inventory-wide total, so the header
        // can show "12 of 218" without a second request.
        if (!queryFiltered) setUnfilteredTotal(result.total);
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : 'Could not load the inventory.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    page,
    pageSize,
    search,
    source,
    assigned,
    assigneeId,
    clientName,
    projectId,
    vmSpec,
    ownerType,
    ownerId,
    queryFiltered,
    reloadKey,
  ]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Bulk actions only reach inventory-owned rows. Locked ones stay selectable
  // because an override is still valid on them; the delete call skips them.
  const selectableRows = useMemo(() => rows.filter((r) => r.serverId), [rows]);

  /** IPs of the selected rows on this page, for the reset confirmation list. */
  const selectedIps = useMemo(
    () => rows.filter((r) => r.serverId && selected.has(r.serverId)).map((r) => r.ipAddress),
    [rows, selected]
  );
  const allOnPageSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.serverId!));

  const toggleRow = useCallback((serverId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  }, []);

  const togglePage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = selectableRows.map((r) => r.serverId!);
      if (ids.every((id) => next.has(id))) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, [selectableRows]);

  const bulkDelete = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} VM${ids.length === 1 ? '' : 's'} from the inventory, along with all of their logins and assignments?`
      )
    ) {
      return;
    }

    setBulkBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await bulkDeleteInventoryServers(ids);
      setSelected(new Set());
      const skippedNote =
        result.skipped.length > 0
          ? ` ${result.skipped.length} skipped: ${result.skipped
              .slice(0, 3)
              .map((s) => `${s.ipAddress ?? s.serverId} (${s.reason})`)
              .join('; ')}${result.skipped.length > 3 ? '…' : ''}`
          : '';
      setNotice(`Deleted ${result.deleted} VM${result.deleted === 1 ? '' : 's'}.${skippedNote}`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete those VMs.');
    } finally {
      setBulkBusy(false);
    }
  }, [selected, reload]);

  const toggleReveal = useCallback(
    async (credentialId: string) => {
      if (revealed[credentialId]) {
        setRevealed((prev) => {
          const next = { ...prev };
          delete next[credentialId];
          return next;
        });
        return;
      }
      setRevealing(credentialId);
      try {
        const { password } = await revealCredentialPassword(credentialId);
        setRevealed((prev) => ({ ...prev, [credentialId]: password }));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not reveal that password.');
      } finally {
        setRevealing(null);
      }
    },
    [revealed]
  );

  const toggleLock = useCallback(
    async (row: VmInventoryRow) => {
      if (!row.serverId) return;
      try {
        await setInventoryServerLock(row.serverId, !row.inventoryLocked);
        reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not change the lock.');
      }
    },
    [reload]
  );

  const removeServer = useCallback(
    async (row: VmInventoryRow) => {
      if (!row.serverId) return;
      if (!window.confirm(`Delete ${row.ipAddress} and all of its logins and assignments?`)) return;
      try {
        await deleteInventoryServer(row.serverId);
        reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not delete that server.');
      }
    },
    [reload]
  );

  // Header dropdown choices, each led by its "no filter" entry.
  const specFilterOptions = useMemo(
    () => [
      { value: '', label: 'All specs' },
      ...(filterOptions?.vmSpecs ?? []).map((s) => ({ value: s, label: s })),
    ],
    [filterOptions]
  );
  const assigneeFilterOptions = useMemo(
    () => [
      { value: '', label: 'All users' },
      ...(filterOptions?.assignees ?? []).map((a) => ({ value: a.id, label: a.label })),
    ],
    [filterOptions]
  );
  const ownerFilterOptions = useMemo(
    () => [
      { value: '', label: 'All admins' },
      ...(filterOptions?.owners ?? []).map((o) => ({
        value: `${o.type}:${o.id}`,
        label: o.type === 'tenant' ? `${o.label} (tenant)` : o.label,
      })),
    ],
    [filterOptions]
  );
  const clientFilterOptions = useMemo(
    () => [
      { value: '', label: 'All clients' },
      ...(filterOptions?.clients ?? []).map((c) => ({ value: c, label: c })),
    ],
    [filterOptions]
  );
  const projectFilterOptions = useMemo(
    () => [
      { value: '', label: 'All projects' },
      ...(filterOptions?.projects ?? []).map((p) => ({
        value: p.id,
        label: `${p.name} · ${p.clientName}`,
      })),
    ],
    [filterOptions]
  );

  const filtersActive = Boolean(
    searchInput || source || assigned || assigneeId || owner || clientName || projectId || vmSpec
  );

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setSource('');
    setAssigned('');
    setAssigneeId('');
    setOwner('');
    setClientName('');
    setProjectId('');
    setVmSpec('');
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  const manageRowLive = useMemo(
    () => (manageRow ? rows.find((r) => r.ipAddress === manageRow.ipAddress) ?? manageRow : null),
    [manageRow, rows]
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">VM Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every machine across VPS, VM Catalog, dedicated servers and the inventory itself, merged by
            IP address.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Total VMs
            </p>
            <p className="text-xl font-semibold leading-tight text-gray-900">
              {total.toLocaleString()}
              {queryFiltered && unfilteredTotal !== null && (
                <span className="ml-1 text-sm font-normal text-gray-400">
                  of {unfilteredTotal.toLocaleString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAlertsOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <BellRing className="h-4 w-4" />
              Expiry alerts
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
            >
              <Upload className="h-4 w-4" />
              Import provider servers
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={`${inputClass} pl-9`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search IP, username or provider…"
          />
        </div>
        <select
          className={`${inputClass} w-auto`}
          value={source}
          onChange={(e) => {
            setSource(e.target.value as InventorySource | '');
            setPage(1);
          }}
        >
          <option value="">All sources</option>
          {(Object.keys(SOURCE_LABELS) as InventorySource[]).map((key) => (
            <option key={key} value={key}>
              {SOURCE_LABELS[key]}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} w-auto`}
          value={assigned}
          onChange={(e) => {
            setAssigned(e.target.value as '' | 'assigned' | 'unassigned');
            setPage(1);
          }}
        >
          <option value="">Any assignment</option>
          <option value="assigned">Assigned</option>
          <option value="unassigned">Unassigned</option>
        </select>

        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-emerald-700 underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B91C1C]/20 bg-[#B91C1C]/5 px-4 py-3">
          <p className="text-sm font-medium text-gray-800">
            {selected.size} VM{selected.size === 1 ? '' : 's'} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={bulkBusy}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              Reset VM
            </button>
            <button
              type="button"
              onClick={() => setOverrideOpen(true)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              <ShieldCheck className="h-4 w-4" />
              Access override
            </button>
            <button
              type="button"
              onClick={() => setUnassignOpen(true)}
              disabled={bulkBusy}
              title="Release every login on these VMs and return them to the free pool"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              <UserMinus className="h-4 w-4" />
              Unassign &amp; free
            </button>
            <button
              type="button"
              onClick={() => void bulkDelete()}
              disabled={bulkBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-60"
            >
              {bulkBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete selected
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Add columns:</span>
        {OPTIONAL_COLUMNS.map((col) => {
          const on = extraColumns.has(col.key);
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => toggleExtraColumn(col.key)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                on
                  ? 'border-[#B91C1C] bg-[#B91C1C]/5 text-[#B91C1C]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span
                className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border text-[10px] leading-none ${
                  on ? 'border-[#B91C1C] text-[#B91C1C]' : 'border-gray-300 text-gray-500'
                }`}
              >
                {on ? '×' : '+'}
              </span>
              {col.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <table className="w-full min-w-[1320px] text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr className="align-top">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={togglePage}
                  disabled={selectableRows.length === 0}
                  aria-label="Select all inventory VMs on this page"
                  className="h-4 w-4 cursor-pointer rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-40"
                />
              </th>
              <th className="px-4 py-3">IP address</th>
              <th className="px-4 py-3">
                VM spec
                <HeaderFilter
                  label="Filter by VM spec"
                  value={vmSpec}
                  onChange={(v) => {
                    setVmSpec(v);
                    setPage(1);
                  }}
                  options={specFilterOptions}
                  disabled={!filterOptions}
                />
              </th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Password</th>
              {extraColumns.has('assignedUser') && (
                <th className="px-4 py-3">
                  Assigned user
                  <HeaderFilter
                    label="Filter by assigned user"
                    value={assigneeId}
                    onChange={(v) => {
                      setAssigneeId(v);
                      setPage(1);
                    }}
                    options={assigneeFilterOptions}
                    disabled={!filterOptions}
                  />
                </th>
              )}
              {extraColumns.has('assignedAdmin') && (
                <th className="px-4 py-3">
                  Assigned admin
                  <HeaderFilter
                    label="Filter by assigned admin or tenant"
                    value={owner}
                    onChange={(v) => {
                      setOwner(v);
                      setPage(1);
                    }}
                    options={ownerFilterOptions}
                    disabled={!filterOptions}
                  />
                </th>
              )}
              {extraColumns.has('clientName') && (
                <th className="px-4 py-3">
                  Client name
                  <HeaderFilter
                    label="Filter by client name"
                    value={clientName}
                    onChange={(v) => {
                      setClientName(v);
                      setPage(1);
                    }}
                    options={clientFilterOptions}
                    disabled={!filterOptions}
                  />
                </th>
              )}
              {extraColumns.has('projectName') && (
                <th className="px-4 py-3">
                  Project name
                  <HeaderFilter
                    label="Filter by project name"
                    value={projectId}
                    onChange={(v) => {
                      setProjectId(v);
                      setPage(1);
                    }}
                    options={projectFilterOptions}
                    disabled={!filterOptions}
                  />
                </th>
              )}
              <th className="px-4 py-3">Client start</th>
              <th className="px-4 py-3">Client end</th>
              <th className="px-4 py-3">Provider start</th>
              <th className="px-4 py-3">Provider end</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td
                  colSpan={BASE_COLUMN_COUNT + extraColumns.size}
                  className="px-4 py-12 text-center"
                >
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={BASE_COLUMN_COUNT + extraColumns.size}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  No machines match these filters.
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row) => {
                // Every credential contributes one line to the stacked columns.
                const lines = row.credentials.length > 0 ? row.credentials : [null];
                return (
                  <tr key={row.ipAddress} className="align-top">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(row.serverId && selected.has(row.serverId))}
                        onChange={() => row.serverId && toggleRow(row.serverId)}
                        disabled={!row.serverId}
                        aria-label={`Select ${row.ipAddress}`}
                        title={
                          !row.serverId
                            ? 'Only VMs added to the inventory can be selected'
                            : row.inventoryLocked
                              ? 'Locked — a bulk delete will skip this VM'
                              : `Select ${row.ipAddress}`
                        }
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {row.ipAddress}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {/* Free means assignable to anyone: nobody holds a login
                            and no owner is claiming the box. */}
                        {row.credentials.every((c) => c.assignments.length === 0) &&
                          (row.owner.tenantId || row.owner.adminId ? (
                            <span
                              className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200"
                              title={`No logins assigned, but still owned by ${
                                row.owner.tenantName ?? row.owner.adminEmail
                              }. Unassign it to free the VM.`}
                            >
                              unassigned
                            </span>
                          ) : (
                            <span
                              className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                              title="No owner and no logins assigned — ready for anyone"
                            >
                              free
                            </span>
                          ))}
                        {row.inventoryLocked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200">
                            <Lock className="h-2.5 w-2.5" />
                            locked
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-gray-500">{row.vmType ?? '—'}</p>
                      {(row.owner.tenantName || row.owner.adminEmail) && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {row.owner.tenantName ?? row.owner.adminEmail}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-700">{row.vmSpec ?? '—'}</p>
                      {row.planDuration && (
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                          {row.planDuration}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <StackedCell>
                        {lines.map((cred, i) => (
                          <p
                            key={cred?.credentialId ?? `u-${i}`}
                            className="font-mono text-xs text-gray-900"
                          >
                            {cred?.username ?? '—'}
                          </p>
                        ))}
                      </StackedCell>
                    </td>

                    <td className="px-4 py-3">
                      <StackedCell>
                        {lines.map((cred, i) => {
                          if (!cred?.hasPassword) {
                            return (
                              <p key={cred?.credentialId ?? `p-${i}`} className="text-xs text-gray-400">
                                —
                              </p>
                            );
                          }
                          if (!cred.canReveal || !cred.credentialId) {
                            return (
                              <p
                                key={cred.credentialId ?? `p-${i}`}
                                className="text-xs text-gray-400"
                                title="Managed in its own console"
                              >
                                ••••••••
                              </p>
                            );
                          }
                          const shown = revealed[cred.credentialId];
                          return (
                            <div key={cred.credentialId} className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-gray-900">
                                {shown ?? '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => void toggleReveal(cred.credentialId!)}
                                className="text-gray-400 transition hover:text-gray-700"
                                aria-label={shown ? 'Hide password' : 'Reveal password'}
                              >
                                {revealing === cred.credentialId ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : shown ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </StackedCell>
                    </td>

                    {/* A login can be granted to more than one user, so this
                        stacks per credential to stay aligned with Username. */}
                    {extraColumns.has('assignedUser') && (
                      <td className="px-4 py-3">
                        <StackedCell>
                          {lines.map((cred, i) => (
                            <div key={cred?.credentialId ?? `au-${i}`} className="space-y-0.5">
                              {!cred || cred.assignments.length === 0 ? (
                                <p className="text-xs text-gray-400">—</p>
                              ) : (
                                cred.assignments.map((a) => (
                                  <p key={a.assignmentId} className="text-xs text-gray-700">
                                    {a.email ?? a.username ?? '—'}
                                  </p>
                                ))
                              )}
                            </div>
                          ))}
                        </StackedCell>
                      </td>
                    )}

                    {extraColumns.has('assignedAdmin') && (
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-700">
                          {row.owner.adminEmail ?? row.owner.tenantName ?? '—'}
                        </p>
                        {row.owner.tenantName && !row.owner.adminEmail && (
                          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                            tenant
                          </p>
                        )}
                      </td>
                    )}

                    {/* Like the client dates, the project lives on the
                        assignment; the row value only exists for VMs whose
                        source collection carries a projectId directly. */}
                    {extraColumns.has('clientName') && (
                      <td className="px-4 py-3">
                        <StackedCell>
                          {lines.map((cred, i) => (
                            <p key={cred?.credentialId ?? `cn-${i}`} className="text-xs text-gray-700">
                              {cred && cred.assignments.length > 0
                                ? cred.assignments.map((a) => a.clientName ?? '—').join(', ')
                                : (row.clientName ?? '—')}
                            </p>
                          ))}
                        </StackedCell>
                      </td>
                    )}

                    {extraColumns.has('projectName') && (
                      <td className="px-4 py-3">
                        <StackedCell>
                          {lines.map((cred, i) => (
                            <p key={cred?.credentialId ?? `pn-${i}`} className="text-xs text-gray-700">
                              {cred && cred.assignments.length > 0
                                ? cred.assignments.map((a) => a.projectName ?? '—').join(', ')
                                : (row.projectName ?? '—')}
                            </p>
                          ))}
                        </StackedCell>
                      </td>
                    )}

                    {/* Client dates come from each assignment's project, so they
                        stack per credential and fall back to the row project. */}
                    <td className="px-4 py-3">
                      <StackedCell>
                        {lines.map((cred, i) => (
                          <p key={cred?.credentialId ?? `cs-${i}`} className="text-xs text-gray-700">
                            {cred && cred.assignments.length > 0
                              ? cred.assignments.map((a) => fmtDate(a.clientStartDate)).join(', ')
                              : fmtDate(row.clientStartDate)}
                          </p>
                        ))}
                      </StackedCell>
                    </td>
                    <td className="px-4 py-3">
                      <StackedCell>
                        {lines.map((cred, i) => (
                          <div key={cred?.credentialId ?? `ce-${i}`} className="space-y-1">
                            {cred && cred.assignments.length > 0 ? (
                              cred.assignments.map((a) => (
                                <EndDate key={a.assignmentId} iso={a.clientEndDate} />
                              ))
                            ) : (
                              <EndDate iso={row.clientEndDate} />
                            )}
                          </div>
                        ))}
                      </StackedCell>
                    </td>

                    <td className="px-4 py-3 text-xs text-gray-700">
                      {fmtDate(row.providerStartDate)}
                    </td>
                    <td className="px-4 py-3">
                      <EndDate iso={row.providerEndDate} />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setManageRow(row)}
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleLock(row)}
                          disabled={!row.serverId}
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                          title={
                            !row.serverId
                              ? ownedElsewhere(row)
                              : row.inventoryLocked
                                ? 'Unlock VM'
                                : 'Lock VM'
                          }
                        >
                          {row.inventoryLocked ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <LockOpen className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setManageRow(row);
                          }}
                          disabled={!row.serverId}
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-amber-600 disabled:opacity-30"
                          title="Access override"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeServer(row)}
                          disabled={!row.serverId || row.inventoryLocked}
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                          title={
                            !row.serverId
                              ? ownedElsewhere(row)
                              : row.inventoryLocked
                                ? 'Unlock before deleting'
                                : 'Delete VM'
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {total === 0
            ? 'No results'
            : `Showing ${showingFrom}–${showingTo} of ${total} IP addresses`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {importOpen && (
        <VmInventoryImportModal
          onClose={() => setImportOpen(false)}
          onImported={reload}
        />
      )}

      {alertsOpen && <VmInventoryExpiryAlertsModal onClose={() => setAlertsOpen(false)} />}

      {resetOpen && (
        <VmInventoryResetModal
          serverIds={[...selected]}
          ipAddresses={selectedIps}
          onClose={() => setResetOpen(false)}
          onFinished={(message) => {
            setResetOpen(false);
            setNotice(message);
            setSelected(new Set());
            reload();
          }}
        />
      )}

      {unassignOpen && (
        <VmInventoryBulkUnassignModal
          serverIds={[...selected]}
          rows={rows.filter((r) => r.serverId && selected.has(r.serverId))}
          onClose={() => setUnassignOpen(false)}
          onApplied={(message) => {
            setUnassignOpen(false);
            setNotice(message);
            setSelected(new Set());
            reload();
          }}
        />
      )}

      {overrideOpen && (
        <VmInventoryBulkOverrideModal
          serverIds={[...selected]}
          onClose={() => setOverrideOpen(false)}
          onApplied={(message) => {
            setOverrideOpen(false);
            setNotice(message);
            setSelected(new Set());
            reload();
          }}
        />
      )}

      {manageRowLive && (
        <VmInventoryManageModal
          row={manageRowLive}
          onClose={() => setManageRow(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
