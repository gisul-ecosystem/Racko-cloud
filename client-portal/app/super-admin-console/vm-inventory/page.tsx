'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Database, RefreshCw, Search, Upload } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchSuperAdminVmInventory,
  fetchSuperAdminVmInventoryOwners,
  importVmProviderMetadata,
  type InventoryOwnerScope,
  type InventoryResourceType,
  type InventoryStatus,
  type SuperAdminVmInventoryItem,
  type SuperAdminVmInventoryOwnerOption,
  type VmProviderMetadataImportRow,
} from '@/lib/superAdminVmInventoryApi';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

type ServiceKey = '' | 'vm-management' | 'create-vm' | 'elastic-servers';
type SortBy = 'createdAt' | 'owner' | 'service';
type SortDirection = 'asc' | 'desc';
type FlashMessage = { type: 'success' | 'error'; text: string } | null;

type AssignmentEntry = {
  username: string;
  isTenantUser: boolean;
  tenantName?: string;
  planDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly' | null;
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
  assignments: AssignmentEntry[];
};

function StatusBadge({ status }: { status: InventoryStatus }) {
  const tone =
    status === 'active'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'suspended'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : status === 'failed'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : status === 'deleted'
            ? 'border-slate-200 bg-slate-100 text-slate-700'
            : 'border-blue-200 bg-blue-50 text-blue-700';

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

function OwnerChip({ scope }: { scope: InventoryOwnerScope }) {
  const tone =
    scope === 'tenant'
      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
      : 'border-sky-200 bg-sky-50 text-sky-700';

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{scope}</span>;
}

function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function readCell(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return undefined;
}

function normalizeDateCell(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

function buildAssignmentRows(items: SuperAdminVmInventoryItem[]): AssignmentRow[] {
  const grouped = new Map<string, AssignmentRow>();

  for (const item of items) {
    const key = item.ipAddress?.trim() ? item.ipAddress.trim() : item.inventoryId;
    const current = grouped.get(key) ?? {
      rowKey: key,
      ipAddress: item.ipAddress || '—',
      vmNames: [],
      assignments: [],
    };

    if (!current.vmNames.includes(item.name)) {
      current.vmNames.push(item.name);
    }

    for (const assignment of item.mappedAssignments) {
      const exists = current.assignments.some(
        (candidate) =>
          candidate.username === assignment.username &&
          candidate.isTenantUser === assignment.isTenantUser &&
          candidate.providerStartDate === assignment.providerStartDate &&
          candidate.providerEndDate === assignment.providerEndDate &&
          candidate.startDate === assignment.startDate &&
          candidate.endDate === assignment.endDate
      );

      if (!exists) {
        current.assignments.push(assignment);
      }
    }

    grouped.set(key, current);
  }

  return [...grouped.values()];
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
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const sortIndicator = (column: SortBy) => {
    if (props.sortBy !== column) return '↕';
    return props.sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
        <p className="text-sm font-semibold text-gray-900">Inventory records</p>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Total {props.total.toLocaleString()}</span>
          <span>•</span>
          <span>Page {props.page} / {props.totalPages}</span>
        </div>
      </div>

      {props.loading ? <TableSkeleton rows={8} cols={9} /> : null}

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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 first:px-6">VM</th>
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
                        <option value="elastic-servers">Elastic Server Import</option>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tenant map</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Network</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <button
                      type="button"
                      onClick={() => props.onToggleSort('createdAt')}
                      className="inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                    >
                      Created
                      <span className="text-gray-400">{sortIndicator('createdAt')}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((item, idx) => (
                  <tr key={item.inventoryId} className={`border-b border-gray-50 align-top hover:bg-gray-50 ${idx % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {typeof item.vmid === 'number' ? <p className="mt-0.5 text-[11px] text-gray-500">VMID #{item.vmid}</p> : null}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-700">{item.originServiceLabel}</td>
                    <td className="px-4 py-3.5 text-xs">
                      <OwnerChip scope={item.ownerScope} />
                      <p className="mt-1 text-gray-700">{item.ownerTenantName || item.ownerAdminEmail || 'Unknown owner'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <p className="text-gray-700">{item.mappedTenantName || '—'}</p>
                      {item.mappedTenantUserEmail ? <p className="mt-1 text-[11px] text-gray-500">{item.mappedTenantUserEmail}</p> : null}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-700">
                      <p>{item.ipAddress || '—'}</p>
                      <p className="mt-0.5 uppercase tracking-wide text-gray-500">{item.protocol || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={item.status} /></td>
                    <td className="px-4 py-3.5 text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</td>
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
  showVmNames: boolean;
  showUsers: boolean;
  onShowVmNames: () => void;
  onHideVmNames: () => void;
  onShowUsers: () => void;
  onHideUsers: () => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">VM assignment view</p>
          <p className="text-xs text-gray-500">IP-first view with merged VM names and user mappings</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!props.showVmNames ? (
            <button type="button" onClick={props.onShowVmNames} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white text-[10px] leading-none">+</span>
              VM name
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
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 first:px-6">IP</th>
              {props.showVmNames ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>VM name</span>
                    <button type="button" onClick={props.onHideVmNames} className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] font-medium normal-case tracking-normal text-gray-600 hover:bg-gray-100" aria-label="Collapse VM name column">-</button>
                  </div>
                </th>
              ) : null}
              {props.showUsers ? (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>Assigned usernames</span>
                    <button type="button" onClick={props.onHideUsers} className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-[10px] font-medium normal-case tracking-normal text-gray-600 hover:bg-gray-100" aria-label="Collapse assigned usernames column">-</button>
                  </div>
                </th>
              ) : null}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Plan duration</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">VM username</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">VM password</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Provider start date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Provider end date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Client start date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Client end date</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, idx) => (
              <tr key={`${row.rowKey}:assignment`} className={`border-b border-gray-50 align-top hover:bg-gray-50 ${idx % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-6 py-3.5 text-xs text-gray-700">{row.ipAddress}</td>
                {props.showVmNames ? (
                  <td className="px-4 py-3.5">
                    {row.vmNames.length > 0 ? row.vmNames.map((vmName, vmIndex) => <p key={`${row.rowKey}:vmname:${vmIndex}`} className="font-medium text-gray-900">{vmName}</p>) : <p className="text-[11px] text-gray-400">—</p>}
                  </td>
                ) : null}
                {props.showUsers ? (
                  <td className="px-4 py-3.5 text-xs">
                    {row.assignments.length > 0 ? row.assignments.map((assignment, assignmentIndex) => (
                      <div key={`${row.rowKey}:assignment:${assignmentIndex}`} className="flex items-center gap-2">
                        <span className="text-gray-700">{assignment.username}</span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${assignment.isTenantUser ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                          {assignment.isTenantUser ? assignment.tenantName || 'Tenant' : 'Platform'}
                        </span>
                      </div>
                    )) : <p className="text-[11px] text-gray-400">No mapped users</p>}
                  </td>
                ) : null}
                <td className="px-4 py-3.5 text-xs">{row.assignments.length > 0 ? row.assignments.map((assignment, assignmentIndex) => <p key={`${row.rowKey}:plan:${assignmentIndex}`} className="text-gray-700">{assignment.planDuration || '—'}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{row.assignments.length > 0 ? row.assignments.map((assignment, assignmentIndex) => <p key={`${row.rowKey}:vmuser:${assignmentIndex}`} className="text-gray-700">{assignment.vmUsername || '—'}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{row.assignments.length > 0 ? row.assignments.map((assignment, assignmentIndex) => <p key={`${row.rowKey}:vmpass:${assignmentIndex}`} className="text-gray-700">{assignment.vmPassword || '—'}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{row.assignments.length > 0 ? row.assignments.map((assignment, assignmentIndex) => <p key={`${row.rowKey}:provider-start:${assignmentIndex}`} className="text-gray-700">{formatDate(assignment.providerStartDate)}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{row.assignments.length > 0 ? row.assignments.map((assignment, assignmentIndex) => <p key={`${row.rowKey}:provider-end:${assignmentIndex}`} className="text-gray-700">{formatDate(assignment.providerEndDate)}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{row.assignments.length > 0 ? row.assignments.map((assignment, assignmentIndex) => <p key={`${row.rowKey}:client-start:${assignmentIndex}`} className="text-gray-700">{formatDate(assignment.startDate)}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
                <td className="px-4 py-3.5 text-xs">{row.assignments.length > 0 ? row.assignments.map((assignment, assignmentIndex) => <p key={`${row.rowKey}:client-end:${assignmentIndex}`} className="text-gray-700">{formatDate(assignment.endDate)}</p>) : <p className="text-[11px] text-gray-400">—</p>}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [showAssignmentView, setShowAssignmentView] = useState(false);
  const [showAssignmentVmNames, setShowAssignmentVmNames] = useState(true);
  const [showAssignmentUsers, setShowAssignmentUsers] = useState(true);
  const [importingProviderMeta, setImportingProviderMeta] = useState(false);
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const requestedPage = showAssignmentView ? 1 : page;
      const requestedLimit = showAssignmentView ? 5000 : limit;
      const result = await fetchSuperAdminVmInventory({
        resourceType: resourceType || undefined,
        ownerScope: ownerScope || undefined,
        originServiceKey: showAssignmentView ? undefined : serviceKey || undefined,
        status: status || undefined,
        search: debouncedSearch || undefined,
        ownerSearch: selectedOwner || undefined,
        sortBy,
        sortDirection,
        page: requestedPage,
        limit: requestedLimit,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VM inventory.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, limit, ownerScope, page, resourceType, selectedOwner, serviceKey, showAssignmentView, sortBy, sortDirection, status]);

  const loadOwnerOptions = useCallback(async () => {
    try {
      const owners = await fetchSuperAdminVmInventoryOwners({
        resourceType: resourceType || undefined,
        ownerScope: ownerScope || undefined,
        originServiceKey: serviceKey || undefined,
        status: status || undefined,
        search: debouncedSearch || undefined,
      });
      setOwnerOptions(owners);
    } catch {
      setOwnerOptions([]);
    }
  }, [debouncedSearch, ownerScope, resourceType, serviceKey, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadOwnerOptions();
  }, [loadOwnerOptions]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);
  const assignmentRows = useMemo(() => buildAssignmentRows(items), [items]);

  const toggleSort = (nextSortBy: SortBy) => {
    if (sortBy === nextSortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(nextSortBy);
      setSortDirection(nextSortBy === 'createdAt' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const handleProviderMetadataUpload = async (file: File) => {
    setImportingProviderMeta(true);
    setFlashMessage(null);
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];

      const parsedRows: VmProviderMetadataImportRow[] = rows
        .map((row) => {
          const ipAddress = String(readCell(row, ['IP', 'Ip', 'IP Address', 'Ip Address', 'ip', 'ipAddress']) ?? '').trim();
          const rawDuration = String(readCell(row, ['Plan Duration', 'Duration', 'Billing Period', 'planDuration']) ?? '').trim().toLowerCase();
          const username = String(readCell(row, ['Username', 'User Name', 'username']) ?? '').trim();
          const password = String(readCell(row, ['Password', 'password']) ?? '').trim();
          const providerStartDate = normalizeDateCell(readCell(row, ['Start Date', 'Provider Start Date', 'startDate']));
          const providerEndDate = normalizeDateCell(readCell(row, ['End Date', 'Provider End Date', 'endDate']));

          let planDuration: VmProviderMetadataImportRow['planDuration'];
          if (rawDuration === 'monthly' || rawDuration === 'month' || rawDuration === 'mon') planDuration = 'monthly';
          else if (rawDuration === 'quarterly' || rawDuration === 'quarter' || rawDuration === 'qtr') planDuration = 'quarterly';
          else if (rawDuration === 'hourly' || rawDuration === 'hour' || rawDuration === 'hr') planDuration = 'hourly';
          else if (rawDuration === 'yearly' || rawDuration === 'year' || rawDuration === 'yr') planDuration = 'yearly';

          return {
            ipAddress,
            planDuration,
            username: username || undefined,
            password: password || undefined,
            providerStartDate,
            providerEndDate,
          };
        })
        .filter((row) => row.ipAddress);

      if (parsedRows.length === 0) {
        setFlashMessage({ type: 'error', text: 'No valid Excel rows found.' });
        return;
      }

      const result = await importVmProviderMetadata(parsedRows);
      setFlashMessage({ type: 'success', text: `Imported provider metadata for ${result.updated} of ${result.total} row(s).` });
      await load();
    } catch (uploadError) {
      setFlashMessage({ type: 'error', text: uploadError instanceof ApiError ? uploadError.message : 'Failed to import provider metadata Excel.' });
    } finally {
      setImportingProviderMeta(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/super-admin-console" className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
            <ChevronLeft className="h-4 w-4" /> All services
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">VM Inventory</h1>
          <p className="mt-0.5 text-sm text-gray-500">Unique VM list across VPS, VM Catalog, and Elastic Server Import.</p>
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
          <button type="button" disabled={importingProviderMeta} onClick={() => uploadInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
            <Upload className="h-4 w-4" />
            {importingProviderMeta ? 'Importing provider Excel…' : 'Upload provider Excel'}
          </button>
          <button type="button" onClick={() => setShowAssignmentView((prev) => !prev)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {showAssignmentView ? 'Inventory records view' : 'VM assignment view'}
          </button>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="mt-6">
        {flashMessage ? (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${flashMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
            {flashMessage.text}
          </div>
        ) : null}
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className={`${inputClass} pl-9`} placeholder="Search name, IP, owner..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
          loading={loading}
          error={error}
          onRetry={() => void load()}
        />
      ) : null}

      {showAssignmentView && !loading && !error && assignmentRows.length > 0 ? (
        <AssignmentTable
          rows={assignmentRows}
          showVmNames={showAssignmentVmNames}
          showUsers={showAssignmentUsers}
          onShowVmNames={() => setShowAssignmentVmNames(true)}
          onHideVmNames={() => setShowAssignmentVmNames(false)}
          onShowUsers={() => setShowAssignmentUsers(true)}
          onHideUsers={() => setShowAssignmentUsers(false)}
        />
      ) : null}
    </div>
  );
}
