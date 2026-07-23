'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError } from '../../../../lib/apiClient';
import { createTenant, deleteTenant, fetchTenants } from '../../../../lib/tenantApi';
import type { Tenant, TenantStatus } from '../../../../lib/tenantTypes';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { TenantStatusBadge } from '../../../../components/super-admin-console/white-labelling/TenantStatusBadge';
import { WhiteLabellingEmptyState } from '../../../../components/super-admin-console/white-labelling/WhiteLabellingEmptyState';

const STATUS_OPTIONS: Array<{ value: '' | TenantStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function TenantsListPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      }
    >
      <TenantsListContent />
    </Suspense>
  );
}

function TenantsListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showCreate = searchParams.get('create') === 'true';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'' | TenantStatus>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(showCreate);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    domain: '',
    logoUrl: '',
    primaryColor: '#1a73e8',
    supportEmail: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTenants({
        page,
        limit: 20,
        status: statusFilter || undefined,
      });
      setTenants(data.tenants);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCreateOpen(showCreate);
  }, [showCreate]);

  const filtered = tenants.filter((tenant) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      tenant.name.toLowerCase().includes(q) ||
      tenant.domain.toLowerCase().includes(q) ||
      tenant.slug.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(total / 20));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const branding: Record<string, string> = {};
      if (form.logoUrl) branding.logoUrl = form.logoUrl;
      if (form.primaryColor) branding.primaryColor = form.primaryColor;
      if (form.supportEmail) branding.supportEmail = form.supportEmail;

      const tenant = await createTenant({
        name: form.name.trim(),
        domain: form.domain.trim().toLowerCase(),
        branding: Object.keys(branding).length > 0 ? branding : undefined,
      });
      setCreateOpen(false);
      router.push(`/super-admin-console/white-labelling/tenants/${tenant.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create tenant');
    } finally {
      setCreating(false);
    }
  };

  const openDelete = (tenant: Tenant) => {
    setDeleteTarget(tenant);
    setDeleteConfirmName('');
    setDeleteError(null);
  };

  const closeDelete = () => {
    if (deletingId) return;
    setDeleteTarget(null);
    setDeleteConfirmName('');
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmName.trim() !== deleteTarget.name) {
      setDeleteError('Type the tenant name exactly to confirm.');
      return;
    }

    setDeletingId(deleteTarget.id);
    setDeleteError(null);
    try {
      await deleteTenant(deleteTarget.id);
      setTenants((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setTotal((t) => Math.max(0, t - 1));
      setDeleteTarget(null);
      setDeleteConfirmName('');
      setFlash(`Tenant "${deleteTarget.name}" deleted.`);
      setTimeout(() => setFlash(null), 4000);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete tenant');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Create and manage white-label tenant organizations
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#991B1B]"
        >
          <Plus className="h-4 w-4" />
          Create tenant
        </button>
      </div>

      {flash && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {flash}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, domain or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value as '' | TenantStatus);
            }}
            className="inline-flex appearance-none items-center gap-2 rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm shadow-sm focus:border-[#B91C1C] focus:outline-none"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <p className="w-full text-xs text-gray-400">
          Search filters the current page only. Server-side search is not available yet.
        </p>
      </div>

      {loading && tenants.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      ) : error && tenants.length === 0 ? (
        <ErrorState title="Failed to load tenants" message={error} onRetry={load} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">Tenant</th>
                <th className="px-5 py-3">Domain</th>
                <th className="px-5 py-3">Slug</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10">
                    <WhiteLabellingEmptyState
                      icon={Search}
                      title="No tenants found"
                      description={
                        search || statusFilter
                          ? 'Try adjusting your search or filter.'
                          : 'Create your first tenant to get started.'
                      }
                      action={
                        !search && !statusFilter ? (
                          <button
                            type="button"
                            onClick={() => setCreateOpen(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
                          >
                            <Plus className="h-4 w-4" />
                            Create tenant
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((tenant) => (
                  <tr key={tenant.id} className="transition hover:bg-gray-50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
                          <Building2 className="h-3.5 w-3.5 text-[#B91C1C]" />
                        </div>
                        <span className="font-medium text-gray-900">{tenant.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{tenant.domain}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{tenant.slug}</td>
                    <td className="px-5 py-3.5">
                      <TenantStatusBadge status={tenant.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => openDelete(tenant)}
                          disabled={deletingId === tenant.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                        <Link
                          href={`/super-admin-console/white-labelling/tenants/${tenant.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#B91C1C] hover:underline"
                        >
                          Manage <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-[#B91C1C]" />
                <h2 className="text-base font-semibold text-gray-900">Create tenant</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
                  placeholder="Acme Labs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Domain *</label>
                <input
                  required
                  value={form.domain}
                  onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
                  placeholder="labs.acme.com"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Logo URL</label>
                  <input
                    value={form.logoUrl}
                    onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Primary color</label>
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                    className="h-10 w-full cursor-pointer rounded-lg border border-gray-200"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Support email</label>
                <input
                  type="email"
                  value={form.supportEmail}
                  onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
                  placeholder="support@acme.com"
                />
              </div>
              {createError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#991B1B] disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">Delete tenant</h2>
              <button
                type="button"
                onClick={closeDelete}
                disabled={Boolean(deletingId)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-gray-600">
                Permanently delete{' '}
                <span className="font-medium text-gray-900">{deleteTarget.name}</span> (
                {deleteTarget.domain})?
              </p>
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
                This erases the tenant and all related data from the database: admins, users,
                services, branding, wallet, orders, VMs, elastic servers, and notifications. This
                cannot be undone.
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Type <span className="font-semibold">{deleteTarget.name}</span> to confirm
                </label>
                <input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  disabled={Boolean(deletingId)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none disabled:opacity-50"
                  placeholder={deleteTarget.name}
                  autoComplete="off"
                />
              </div>
              {deleteError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDelete}
                  disabled={Boolean(deletingId)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={
                    Boolean(deletingId) || deleteConfirmName.trim() !== deleteTarget.name
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingId === deleteTarget.id && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Delete forever
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
