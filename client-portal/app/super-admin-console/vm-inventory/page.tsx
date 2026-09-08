'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  bulkDeleteInventoryServers,
  deleteInventoryServer,
  fetchVmInventory,
  revealCredentialPassword,
  setInventoryServerLock,
  SOURCE_LABELS,
  type InventorySource,
  type VmInventoryRow,
} from '@/lib/vmInventoryApi';
import { VmInventoryImportModal } from '@/components/super-admin-console/vm-inventory/VmInventoryImportModal';
import { VmInventoryManageModal } from '@/components/super-admin-console/vm-inventory/VmInventoryManageModal';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

const SOURCE_STYLES: Record<InventorySource, string> = {
  inventory: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  platform_vm: 'bg-blue-50 text-blue-700 ring-blue-200',
  catalog_vm: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  dedicated_server: 'bg-purple-50 text-purple-700 ring-purple-200',
};

const fmtDate = (iso: string | null): string => (iso ? iso.slice(0, 10) : '—');

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

  /** Selected server IDs, kept across pages so a multi-page delete is possible. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [manageRow, setManageRow] = useState<VmInventoryRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
      },
      controller.signal
    )
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
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
  }, [page, pageSize, search, source, assigned, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Only inventory-owned, unlocked rows can be deleted; the rest aren't selectable.
  const selectableRows = useMemo(
    () => rows.filter((r) => r.serverId && !r.inventoryLocked),
    [rows]
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
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
        >
          <Upload className="h-4 w-4" />
          Import servers
        </button>
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

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <table className="w-full min-w-[1160px] text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={togglePage}
                  disabled={selectableRows.length === 0}
                  aria-label="Select all deletable VMs on this page"
                  className="h-4 w-4 cursor-pointer rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-40"
                />
              </th>
              <th className="px-4 py-3">IP address</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Password</th>
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
                <td colSpan={9} className="px-4 py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">
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
                        disabled={!row.serverId || row.inventoryLocked}
                        aria-label={`Select ${row.ipAddress}`}
                        title={
                          !row.serverId
                            ? 'Only VMs added to the inventory can be deleted'
                            : row.inventoryLocked
                              ? 'Unlock before deleting'
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
                        {row.sources.map((s) => (
                          <span
                            key={s}
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${SOURCE_STYLES[s]}`}
                          >
                            {SOURCE_LABELS[s]}
                          </span>
                        ))}
                        {row.inventoryLocked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200">
                            <Lock className="h-2.5 w-2.5" />
                            locked
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-gray-500">
                        {row.vmType ?? '—'}
                        {row.vmSpec ? ` · ${row.vmSpec}` : ''}
                        {row.planDuration ? ` · ${row.planDuration}` : ''}
                      </p>
                      {(row.owner.tenantName || row.owner.adminEmail) && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {row.owner.tenantName ?? row.owner.adminEmail}
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
                          <p key={cred?.credentialId ?? `ce-${i}`} className="text-xs text-gray-700">
                            {cred && cred.assignments.length > 0
                              ? cred.assignments.map((a) => fmtDate(a.clientEndDate)).join(', ')
                              : fmtDate(row.clientEndDate)}
                          </p>
                        ))}
                      </StackedCell>
                    </td>

                    <td className="px-4 py-3 text-xs text-gray-700">
                      {fmtDate(row.providerStartDate)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {fmtDate(row.providerEndDate)}
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
                          title={row.inventoryLocked ? 'Unlock VM' : 'Lock VM'}
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
                          title={row.inventoryLocked ? 'Unlock before deleting' : 'Delete VM'}
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
