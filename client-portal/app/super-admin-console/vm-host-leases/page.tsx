'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Trash,
  Upload,
  X,
} from 'lucide-react';
import styles from './scrollbar.module.css';
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
  updateVmHostLease,
  createVmHostLease,
  type VmHostLease,
  type UpdateVmHostLeaseDto,
  type CreateVmHostLeaseDto,
} from '@/lib/vmHostLeaseApi';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateForInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
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

function ClientAssignmentBadge({ endDate }: { endDate: string }) {
  const days = daysUntil(endDate);
  if (days < 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Assignment Expired
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        Exp in {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
      {days}d remaining
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

function EditableCell({
  value,
  onChange,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  );
}

export default function VmHostLeasesPage() {
  const { toasts, addToast, dismiss } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

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
  const [descriptionCollapsed, setDescriptionCollapsed] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedLeases, setSelectedLeases] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormData, setAddFormData] = useState({
    provider: '',
    ipAddress: '',
    description: '',
    invoiceDate: '',
    dueDate: '',
    assignedTo: '',
    clientAssignmentStartDate: '',
    clientAssignmentEndDate: '',
    vmUsername: '',
    vmPassword: '',
  });
  const [addingLease, setAddingLease] = useState(false);

  // Determine which columns have actual data
  const visibleColumns = useMemo(() => {
    if (leases.length === 0) {
      return {
        provider: true,
        description: true,
        invoiceDate: true,
        assignedTo: true,
        clientAssignmentDates: true,
        vmUsername: true,
      };
    }
    return {
      provider: leases.some((l) => l.provider !== 'N/A'),
      description: leases.some((l) => l.description !== 'N/A'),
      invoiceDate: leases.some((l) => l.invoiceDate),
      assignedTo: leases.some((l) => l.assignedTo !== 'N/A'),
      clientAssignmentDates: leases.some(
        (l) => l.clientAssignmentStartDate || l.clientAssignmentEndDate
      ),
      vmUsername: leases.some((l) => l.vmUsername !== 'N/A'),
    };
  }, [leases]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listVmHostLeases({ page: 1, limit: 200, search: search || undefined });

      // Filter by provider if not "All"
      const filtered =
        provider === 'All' ? result.leases : result.leases.filter((lease) => lease.provider === provider);

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

  const toggleSelectLease = (leaseId: string) => {
    const newSelected = new Set(selectedLeases);
    if (newSelected.has(leaseId)) {
      newSelected.delete(leaseId);
    } else {
      newSelected.add(leaseId);
    }
    setSelectedLeases(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedLeases.size === leases.length) {
      setSelectedLeases(new Set());
    } else {
      setSelectedLeases(new Set(leases.map((l) => l.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeases.size === 0) {
      addToast('error', 'No rows selected');
      return;
    }

    setBulkDeleting(true);
    try {
      const selectedArray = Array.from(selectedLeases);
      let successCount = 0;
      let errorCount = 0;

      for (const leaseId of selectedArray) {
        try {
          await deleteVmHostLease(leaseId);
          successCount++;
        } catch (err) {
          errorCount++;
        }
      }

      setSelectedLeases(new Set());
      addToast(
        'success',
        `Deleted ${successCount} lease(s)${errorCount > 0 ? `. ${errorCount} failed.` : '.'}`
      );
      await load();
    } catch (err) {
      addToast(
        'error',
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Bulk delete failed'
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleAddLease = async () => {
    setAddingLease(true);
    try {
      // Validate required fields
      if (
        !addFormData.provider.trim() ||
        !addFormData.ipAddress.trim() ||
        !addFormData.description.trim() ||
        !addFormData.invoiceDate ||
        !addFormData.dueDate ||
        !addFormData.assignedTo.trim() ||
        !addFormData.vmUsername.trim() ||
        !addFormData.vmPassword.trim()
      ) {
        addToast('error', 'Please fill in all required fields');
        setAddingLease(false);
        return;
      }

      // Validate dates
      const invoiceDate = new Date(addFormData.invoiceDate);
      const dueDate = new Date(addFormData.dueDate);
      if (dueDate < invoiceDate) {
        addToast('error', 'Due Date must be on or after Invoice Date');
        setAddingLease(false);
        return;
      }

      // Validate assignment dates if provided
      if (addFormData.clientAssignmentStartDate && addFormData.clientAssignmentEndDate) {
        const startDate = new Date(addFormData.clientAssignmentStartDate);
        const endDate = new Date(addFormData.clientAssignmentEndDate);
        if (endDate < startDate) {
          addToast('error', 'Assignment End Date must be on or after Assignment Start Date');
          setAddingLease(false);
          return;
        }
      }

      // Convert empty strings to null for optional date fields
      const payload: CreateVmHostLeaseDto = {
        ...addFormData,
        clientAssignmentStartDate: addFormData.clientAssignmentStartDate || null,
        clientAssignmentEndDate: addFormData.clientAssignmentEndDate || null,
      };

      await createVmHostLease(payload);
      addToast('success', `VM lease added successfully for ${addFormData.ipAddress}`);
      
      // Reset form and close modal
      setAddFormData({
        provider: '',
        ipAddress: '',
        description: '',
        invoiceDate: '',
        dueDate: '',
        assignedTo: '',
        clientAssignmentStartDate: '',
        clientAssignmentEndDate: '',
        vmUsername: '',
        vmPassword: '',
      });
      setShowAddModal(false);
      await load();
    } catch (err) {
      addToast(
        'error',
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to add lease'
      );
    } finally {
      setAddingLease(false);
    }
  };

  const startEdit = (lease: VmHostLease) => {
    setEditingId(lease.id);
    setEditData({
      provider: lease.provider,
      ipAddress: lease.ipAddress,
      description: lease.description,
      invoiceDate: formatDateForInput(lease.invoiceDate),
      dueDate: formatDateForInput(lease.dueDate),
      assignedTo: lease.assignedTo,
      clientAssignmentStartDate: lease.clientAssignmentStartDate
        ? formatDateForInput(lease.clientAssignmentStartDate)
        : '',
      clientAssignmentEndDate: lease.clientAssignmentEndDate
        ? formatDateForInput(lease.clientAssignmentEndDate)
        : '',
      vmUsername: lease.vmUsername,
      vmPassword: lease.vmPassword,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (leaseId: string) => {
    setSavingId(leaseId);
    try {
      const updates: UpdateVmHostLeaseDto = {};

      // Only send fields that aren't empty
      if (editData.provider) updates.provider = editData.provider;
      if (editData.ipAddress) updates.ipAddress = editData.ipAddress;
      if (editData.description) updates.description = editData.description;
      if (editData.invoiceDate) updates.invoiceDate = editData.invoiceDate;
      if (editData.dueDate) updates.dueDate = editData.dueDate;
      if (editData.assignedTo) updates.assignedTo = editData.assignedTo;
      if (editData.clientAssignmentStartDate) updates.clientAssignmentStartDate = editData.clientAssignmentStartDate;
      if (editData.clientAssignmentEndDate) updates.clientAssignmentEndDate = editData.clientAssignmentEndDate;
      if (editData.vmUsername) updates.vmUsername = editData.vmUsername;
      if (editData.vmPassword) updates.vmPassword = editData.vmPassword;

      if (Object.keys(updates).length === 0) {
        addToast('error', 'No changes made');
        cancelEdit();
        return;
      }

      await updateVmHostLease(leaseId, updates);
      addToast('success', 'Lease updated successfully');
      setEditingId(null);
      setEditData({});
      await load();
    } catch (err) {
      addToast(
        'error',
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Update failed'
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">VM Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload Excel sheets of VM inventory. Expected columns: Provider, IP Address, Description, Invoice Date,
            Due Date, Assigned To, Client Assignment Start Date, Client Assignment End Date, VM Username, VM Password.
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
            onClick={() => setShowAddModal(true)}
            disabled={false}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Plus className="h-4 w-4" />
            Add Manual
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
              Expected columns: Provider, IP Address, Description, Invoice Date, Due Date, Assigned To, Client
              Assignment Start Date, Client Assignment End Date, VM Username, VM Password
            </p>
          </div>
          <div className="flex flex-col items-end gap-3 w-full max-w-xs">
            <form
              className="relative w-full"
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
              <div className="flex flex-wrap items-center gap-2">
                {visibleColumns.description && (
                  <button
                    type="button"
                    onClick={() => setDescriptionCollapsed(!descriptionCollapsed)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 bg-white transition"
                  >
                    {descriptionCollapsed ? (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" />
                        Show Description
                      </>
                    ) : (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" />
                        Hide Description
                      </>
                    )}
                  </button>
                )}
                {selectedLeases.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setPendingBulkDelete(true)}
                    disabled={bulkDeleting}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    <Trash className="h-3.5 w-3.5" />
                    Delete Selected ({selectedLeases.size})
                  </button>
                )}
              </div>
          </div>
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
          <div>
            {/* Top Scroller - Visible scrollbar area */}
            <div
              ref={topScrollRef}
              className={`overflow-x-auto border border-gray-200 border-b-0 rounded-t-lg bg-gray-50 ${styles.tableScroller}`}
              style={{ height: '20px' }}
              onScroll={(e) => {
                if (tableScrollRef.current) {
                  tableScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
            >
              {/* Spacer that matches table width */}
              <div className="w-max" style={{ minWidth: '100vw' }} />
            </div>

            {/* Table */}
            <div
              ref={tableScrollRef}
              className={`overflow-x-auto border border-gray-200 border-t-0 rounded-b-lg ${styles.tableScroller}`}
              onScroll={(e) => {
                if (topScrollRef.current) {
                  topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
            >
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                    <th className="w-12 px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedLeases.size === leases.length && leases.length > 0}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                        aria-label="Select all rows"
                      />
                    </th>
                    {visibleColumns.provider && (
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-600">
                        Provider
                      </th>
                    )}
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-600">
                      IP Address
                    </th>
                    {visibleColumns.description && !descriptionCollapsed && (
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-600">
                        Description
                      </th>
                    )}
                    {visibleColumns.invoiceDate && (
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-600">
                        Billing
                      </th>
                    )}
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-600">
                      Lease Expiry
                    </th>
                    {visibleColumns.assignedTo && (
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-600">
                        Assigned To
                      </th>
                    )}
                    {visibleColumns.clientAssignmentDates && (
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-600">
                        Assignment Period
                      </th>
                    )}
                    {visibleColumns.vmUsername && (
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-600">
                        Credentials
                      </th>
                    )}
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-gray-100">
                {leases.map((lease) => (
                  <tr
                    key={lease.id}
                    className={`transition-colors ${
                      editingId === lease.id ? 'bg-blue-50' : 'hover:bg-gray-50/60'
                    } ${selectedLeases.has(lease.id) ? 'bg-blue-100' : ''}`}
                  >
                    <td className="w-12 px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedLeases.has(lease.id)}
                        onChange={() => toggleSelectLease(lease.id)}
                        disabled={editingId === lease.id}
                        className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C] disabled:opacity-50"
                        aria-label={`Select row for ${lease.ipAddress}`}
                      />
                    </td>
                    {visibleColumns.provider && (
                      <td className="px-6 py-4">
                        {editingId === lease.id ? (
                          <EditableCell
                            value={editData.provider}
                            onChange={(v) => setEditData({ ...editData, provider: v })}
                          />
                        ) : (
                          <div className="space-y-2">
                            <div className="font-semibold text-gray-900">{lease.provider}</div>
                            <ExpiryBadge dueDate={lease.dueDate} />
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      {editingId === lease.id ? (
                        <EditableCell
                          value={editData.ipAddress}
                          onChange={(v) => setEditData({ ...editData, ipAddress: v })}
                        />
                      ) : (
                        <div className="font-mono text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded w-fit">
                          {lease.ipAddress}
                        </div>
                      )}
                    </td>
                    {visibleColumns.description && !descriptionCollapsed && (
                      <td className="max-w-xs px-3 py-3 text-gray-600">
                        {editingId === lease.id ? (
                          <EditableCell
                            value={editData.description}
                            onChange={(v) => setEditData({ ...editData, description: v })}
                          />
                        ) : (
                          <span className="truncate block">{lease.description}</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.invoiceDate && (
                      <td className="px-6 py-4">
                        {editingId === lease.id ? (
                          <EditableCell
                            value={editData.invoiceDate}
                            onChange={(v) => setEditData({ ...editData, invoiceDate: v })}
                            type="date"
                          />
                        ) : (
                          <div className="text-sm text-gray-700 font-medium">
                            {formatDate(lease.invoiceDate)}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      {editingId === lease.id ? (
                        <EditableCell
                          value={editData.dueDate}
                          onChange={(v) => setEditData({ ...editData, dueDate: v })}
                          type="date"
                        />
                      ) : (
                        <div className="text-sm font-semibold text-gray-900">
                          {formatDate(lease.dueDate)}
                        </div>
                      )}
                    </td>
                    {visibleColumns.assignedTo && (
                      <td className="px-6 py-4">
                        {editingId === lease.id ? (
                          <EditableCell
                            value={editData.assignedTo}
                            onChange={(v) => setEditData({ ...editData, assignedTo: v })}
                          />
                        ) : (
                          <div className="space-y-2">
                            <div className="font-medium text-gray-900">{lease.assignedTo}</div>
                            {lease.clientAssignmentEndDate && (
                              <ClientAssignmentBadge endDate={lease.clientAssignmentEndDate} />
                            )}
                          </div>
                        )}
                      </td>
                    )}
                    {visibleColumns.clientAssignmentDates && (
                      <td className="px-6 py-4">
                        {editingId === lease.id ? (
                          <div className="space-y-2">
                            <EditableCell
                              value={editData.clientAssignmentStartDate}
                              onChange={(v) =>
                                setEditData({ ...editData, clientAssignmentStartDate: v })
                              }
                              type="date"
                            />
                            <span className="text-xs text-gray-500">to</span>
                            <EditableCell
                              value={editData.clientAssignmentEndDate}
                              onChange={(v) =>
                                setEditData({ ...editData, clientAssignmentEndDate: v })
                              }
                              type="date"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-xs text-gray-600">
                              <span className="font-semibold">Start:</span> {lease.clientAssignmentStartDate ? formatDate(lease.clientAssignmentStartDate) : '—'}
                            </div>
                            <div className="text-xs text-gray-600">
                              <span className="font-semibold">End:</span> {lease.clientAssignmentEndDate ? formatDate(lease.clientAssignmentEndDate) : '—'}
                            </div>
                          </div>
                        )}
                      </td>
                    )}
                    {visibleColumns.vmUsername && (
                      <td className="px-6 py-4">
                        {editingId === lease.id ? (
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-gray-600">Username</label>
                              <EditableCell
                                value={editData.vmUsername}
                                onChange={(v) => setEditData({ ...editData, vmUsername: v })}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Password</label>
                              <EditableCell
                                value={editData.vmPassword}
                                onChange={(v) => setEditData({ ...editData, vmPassword: v })}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                            <div className="text-xs">
                              <span className="text-gray-500">User:</span>
                              <UsernameCell value={lease.vmUsername} />
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-500">Pass:</span>
                              <PasswordCell value={lease.vmPassword} />
                            </div>
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right">
                      {editingId === lease.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => void saveEdit(lease.id)}
                            disabled={savingId === lease.id}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition"
                          >
                            <Check className="h-4 w-4" />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={savingId === lease.id}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 transition"
                          >
                            <X className="h-4 w-4" />
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => startEdit(lease)}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(lease)}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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

      <ConfirmModal
        open={pendingBulkDelete}
        title={`Delete ${selectedLeases.size} lease${selectedLeases.size !== 1 ? 's' : ''}?`}
        description={`Remove ${selectedLeases.size} selected lease${selectedLeases.size !== 1 ? 's' : ''}? This action cannot be undone.`}
        confirmLabel={`Delete ${selectedLeases.size}`}
        confirmVariant="danger"
        loading={bulkDeleting}
        onCancel={() => setPendingBulkDelete(false)}
        onConfirm={() => void handleBulkDelete()}
      />

      {/* Add Manual Lease Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add VM Host Lease Manually</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Provider <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={addFormData.provider}
                    onChange={(e) => setAddFormData({ ...addFormData, provider: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select Provider</option>
                    <option value="Webyne">Webyne</option>
                    <option value="Azure">Azure</option>
                    <option value="Aws">AWS</option>
                    <option value="Oci">OCI</option>
                    <option value="Gcp">GCP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    IP Address <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 192.168.1.100"
                    value={addFormData.ipAddress}
                    onChange={(e) => setAddFormData({ ...addFormData, ipAddress: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Production Server"
                    value={addFormData.description}
                    onChange={(e) => setAddFormData({ ...addFormData, description: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invoice Date <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={addFormData.invoiceDate}
                    onChange={(e) => setAddFormData({ ...addFormData, invoiceDate: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={addFormData.dueDate}
                    onChange={(e) => setAddFormData({ ...addFormData, dueDate: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assigned To <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., John Doe"
                    value={addFormData.assignedTo}
                    onChange={(e) => setAddFormData({ ...addFormData, assignedTo: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assignment Start Date <span className="text-gray-400">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={addFormData.clientAssignmentStartDate}
                    onChange={(e) => setAddFormData({ ...addFormData, clientAssignmentStartDate: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assignment End Date <span className="text-gray-400">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={addFormData.clientAssignmentEndDate}
                    onChange={(e) => setAddFormData({ ...addFormData, clientAssignmentEndDate: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    VM Username <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., admin"
                    value={addFormData.vmUsername}
                    onChange={(e) => setAddFormData({ ...addFormData, vmUsername: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    VM Password <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={addFormData.vmPassword}
                    onChange={(e) => setAddFormData({ ...addFormData, vmPassword: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                disabled={addingLease}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAddLease()}
                disabled={addingLease}
                className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#a01717] disabled:opacity-50 transition inline-flex items-center gap-2"
              >
                {addingLease ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Lease
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
