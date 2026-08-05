'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Eye,
  EyeOff,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { OverviewStatCard } from '@/components/super-admin-console/white-labelling/OverviewStatCard';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiClient';
import {
  deleteVmHostLease,
  listVmHostLeases,
  uploadVmHostLeasesExcel,
  type VmHostLease,
} from '@/lib/vmHostLeaseApi';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysUntil(iso: string): number {
  const end = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((end - now) / (24 * 60 * 60 * 1000));
}

function ExpiryBadge({ dueDate }: { dueDate: string }) {
  const days = daysUntil(dueDate);
  if (days < 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Due
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        {days}d left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      {days}d left
    </span>
  );
}

function PasswordCell({ value }: { value: string }) {
  const [hidden, setHidden] = useState(false);
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="block font-mono text-xs text-gray-700 break-words max-w-xs">{hidden ? '••••••••' : value}</span>
      <button
        type="button"
        onClick={() => setHidden((v) => !v)}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label={hidden ? 'Show password' : 'Hide password'}
      >
        {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function UsernameCell({ value }: { value: string }) {
  return (
    <span className="block font-mono text-xs text-gray-700 break-words max-w-xs">{value}</span>
  );
}

export default function VmHostLeasesPage() {
  const { toasts, addToast, dismiss } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [leases, setLeases] = useState<VmHostLease[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [provider, setProvider] = useState<string>('All');
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<VmHostLease | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Determine which columns have actual data
  const visibleColumns = useMemo(() => {
    if (leases.length === 0) {
      return { provider: true, description: true, invoiceDate: true, assignedTo: true, vmUsername: true };
    }
    return {
      provider: leases.some((l) => l.provider !== 'N/A'),
      description: leases.some((l) => l.description !== 'N/A'),
      invoiceDate: leases.some((l) => l.invoiceDate),
      assignedTo: leases.some((l) => l.assignedTo !== 'N/A'),
      vmUsername: leases.some((l) => l.vmUsername !== 'N/A'),
    };
  }, [leases]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listVmHostLeases({ page: 1, limit: 200, search: search || undefined });
      
      // Filter by provider if not "All"
      const filtered = provider === 'All' 
        ? result.leases 
        : result.leases.filter((lease) => lease.provider === provider);
      
      setLeases(filtered);
      setTotal(filtered.length);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to load leases';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [search, provider]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const now = Date.now();
    let dueSoon = 0;
    let overdue = 0;
    for (const lease of leases) {
      const end = new Date(lease.dueDate).getTime();
      if (end < now) overdue += 1;
      else if (end - now <= 7 * 24 * 60 * 60 * 1000) dueSoon += 1;
    }
    return { total, dueSoon, overdue };
  }, [leases, total]);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadVmHostLeasesExcel(file);
      const skipped = result.skippedErrors.length;
      const { inserted, updated } = result.stats;
      
      let message = '';
      if (inserted > 0 && updated > 0) {
        message = `Added ${inserted}, updated ${updated}. ${skipped > 0 ? `${skipped} row(s) skipped.` : ''}`;
      } else if (inserted > 0) {
        message = `Added ${inserted} new record(s). ${skipped > 0 ? `${skipped} row(s) skipped.` : ''}`;
      } else if (updated > 0) {
        message = `Updated ${updated} record(s). ${skipped > 0 ? `${skipped} row(s) skipped.` : ''}`;
      } else {
        message = 'No changes made.';
      }
      
      addToast('success', message);
      await load();
    } catch (err) {
      addToast(
        'error',
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed'
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    try {
      await deleteVmHostLease(pendingDelete.id);
      addToast('success', `Removed lease for ${pendingDelete.ipAddress}`);
      setPendingDelete(null);
      await load();
    } catch (err) {
      addToast(
        'error',
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Delete failed'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">VM Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload Excel sheets of VM inventory. Expected columns: Provider, IP Address, Description, Invoice Date, Due Date, VM Username, VM Password.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading…' : 'Upload Excel'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => void handleUpload(e.target.files?.[0])}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <OverviewStatCard label="Total inventory" value={stats.total} icon={FileSpreadsheet} accent="red" />
        <OverviewStatCard
          label="Due ≤ 7 days"
          value={stats.dueSoon}
          icon={CalendarClock}
          accent="amber"
        />
        <OverviewStatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} accent="blue" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Inventory</h2>
            <p className="text-xs text-gray-500">
              Expected columns: Provider, IP Address, Description, Invoice Date, Due Date, VM Username, VM Password
            </p>
          </div>
          <form
            className="relative w-full max-w-xs"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search IP, provider, or assigned to"
              className={`${inputClass} pl-9`}
            />
          </form>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {['All', 'Webyne', 'Azure', 'Aws', 'Oci', 'Gcp'].map((prov) => (
            <button
              key={prov}
              type="button"
              onClick={() => setProvider(prov)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                provider === prov
                  ? 'bg-[#B91C1C] text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {prov}
            </button>
          ))}
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={9} />
        ) : error ? (
          <ErrorState title="Could not load leases" message={error} onRetry={() => void load()} />
        ) : leases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">No inventory yet</p>
            <p className="mt-1 text-xs text-gray-500">Upload an Excel sheet to populate this list.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {visibleColumns.provider && (
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Provider
                    </th>
                  )}
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    IP Address
                  </th>
                  {visibleColumns.description && (
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Description
                    </th>
                  )}
                  {visibleColumns.invoiceDate && (
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Invoice Date
                    </th>
                  )}
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Due Date
                  </th>
                  {visibleColumns.assignedTo && (
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Assigned To
                    </th>
                  )}
                  {visibleColumns.vmUsername && (
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      VM Username
                    </th>
                  )}
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    VM Password
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {leases.map((lease) => (
                  <tr key={lease.id} className="hover:bg-gray-50/80">
                    {visibleColumns.provider && (
                      <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-900">
                        {lease.provider}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-3 text-gray-700">{lease.ipAddress}</td>
                    {visibleColumns.description && (
                      <td className="max-w-xs px-3 py-3 text-gray-600 truncate">
                        {lease.description}
                      </td>
                    )}
                    {visibleColumns.invoiceDate && (
                      <td className="whitespace-nowrap px-3 py-3 text-gray-600">
                        {formatDate(lease.invoiceDate)}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-3 text-gray-600">
                      {formatDate(lease.dueDate)}
                    </td>
                    {visibleColumns.assignedTo && (
                      <td className="whitespace-nowrap px-3 py-3 text-gray-600">
                        {lease.assignedTo}
                      </td>
                    )}
                    {visibleColumns.vmUsername && (
                      <td className="px-3 py-3 text-gray-600">
                        <UsernameCell value={lease.vmUsername} />
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <PasswordCell value={lease.vmPassword} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <ExpiryBadge dueDate={lease.dueDate} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setPendingDelete(lease)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title="Delete VM host lease?"
        description={
          pendingDelete
            ? `Remove lease for ${pendingDelete.ipAddress} (${pendingDelete.provider})? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleteLoading}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
