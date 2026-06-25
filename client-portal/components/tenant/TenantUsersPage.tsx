'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { ApiError } from '@/lib/apiClient';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import {
  bulkCreateTenantUsers,
  deleteTenantUser,
  fetchTenantUsers,
  fetchTenantVmAssignmentCounts,
  setTenantUserActive,
  createTenantUser,
} from '@/lib/tenantPortalApi';
import type {
  BulkCreateTenantUsersResult,
  TenantUserProfile,
} from '@/types/tenantPortal';

function ModalShell({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        <div className="p-5">{children}</div>
        <div className="border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function TenantUsersPage() {
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();

  const [users, setUsers] = useState<TenantUserProfile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const [singleOpen, setSingleOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkCreateTenantUsersResult | null>(null);

  const [singleEmail, setSingleEmail] = useState('');
  const [singlePassword, setSinglePassword] = useState('');

  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkCount, setBulkCount] = useState('1');
  const [bulkPassword, setBulkPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersResult, countResult] = await Promise.all([
        fetchTenantUsers(),
        fetchTenantVmAssignmentCounts(),
      ]);
      setUsers(usersResult.users);
      setCounts(countResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tenant users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(
    () => users.filter((user) => user.isActive).length,
    [users]
  );

  const handleSingleCreate = async () => {
    setActionId('create-single');
    try {
      await createTenantUser(singleEmail.trim().toLowerCase(), singlePassword);
      addToast('success', 'Tenant user created.');
      setSingleEmail('');
      setSinglePassword('');
      setSingleOpen(false);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to create tenant user.');
    } finally {
      setActionId(null);
    }
  };

  const handleBulkCreate = async () => {
    setActionId('create-bulk');
    try {
      const result = await bulkCreateTenantUsers({
        emailPrefix: bulkPrefix.trim().toLowerCase(),
        count: Number(bulkCount),
        ...(bulkPassword.trim() ? { password: bulkPassword.trim() } : {}),
      });
      setBulkResult(result);
      setBulkOpen(false);
      setBulkPrefix('');
      setBulkCount('1');
      setBulkPassword('');
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Bulk create failed.');
    } finally {
      setActionId(null);
    }
  };

  if (error && !loading) {
    return (
      <ErrorState
        title="Tenant users unavailable"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <ModalShell
        open={singleOpen}
        title="Create tenant user"
        subtitle="This user will only be visible to the tenant admin who created it."
        onClose={() => setSingleOpen(false)}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={singleEmail}
              onChange={(event) => setSingleEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Password</label>
            <input
              type="text"
              value={singlePassword}
              onChange={(event) => setSinglePassword(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!singleEmail || !singlePassword || actionId === 'create-single'}
            onClick={() => void handleSingleCreate()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={tenantAccentButton(accentColor)}
          >
            {actionId === 'create-single' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create user
          </button>
        </div>
      </ModalShell>

      <ModalShell
        open={bulkOpen}
        title="Bulk create tenant users"
        subtitle="Passwords are shown once in the results panel after creation."
        onClose={() => setBulkOpen(false)}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Email prefix</label>
            <input
              type="email"
              value={bulkPrefix}
              onChange={(event) => setBulkPrefix(event.target.value)}
              placeholder="student@college.edu"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Count</label>
            <input
              type="number"
              min={1}
              max={100}
              value={bulkCount}
              onChange={(event) => setBulkCount(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Shared password (optional)
            </label>
            <input
              type="text"
              value={bulkPassword}
              onChange={(event) => setBulkPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">
              Leave empty to auto-generate a unique password per user.
            </p>
          </div>
          <button
            type="button"
            disabled={!bulkPrefix || !bulkCount || actionId === 'create-bulk'}
            onClick={() => void handleBulkCreate()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={tenantAccentButton(accentColor)}
          >
            {actionId === 'create-bulk' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Bulk create
          </button>
        </div>
      </ModalShell>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Tenant users</h1>
          <p className="text-sm text-gray-500">
            Create, activate, and remove the tenant users you manage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSingleOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Create user
          </button>
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={tenantAccentButton(accentColor)}
          >
            <Users className="h-4 w-4" />
            Bulk create
          </button>
        </div>
      </div>

      {bulkResult ? (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                {bulkResult.created} created
              </span>
              {bulkResult.failed > 0 ? (
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                  {bulkResult.failed} failed
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setBulkResult(null)}
              className="text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              Clear results
            </button>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Save these credentials now. Passwords are shown once and cannot be fetched again.
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Password</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {bulkResult.users.map((row) => (
                  <tr key={`${row.email}-${row.status}`} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 text-gray-900">{row.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.password}</td>
                    <td className="px-4 py-3">
                      {row.status === 'created' ? (
                        <span className="text-xs font-medium text-green-700">Created</span>
                      ) : (
                        <span className="text-xs text-red-600" title={row.error}>
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!loading && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {users.length} total
          </span>
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            {activeCount} active
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <TableSkeleton rows={5} cols={5} embedded />
        ) : users.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <Users className="h-7 w-7 text-[#B91C1C]" />
            </div>
            <p className="font-medium text-gray-700">No tenant users yet.</p>
            <p className="mt-1 text-sm text-gray-500">
              Create users, then assign VMs from the VMs page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned VMs</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {counts[user.id] ?? 0} VM{(counts[user.id] ?? 0) === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/tenant/dashboard/vms?userId=${encodeURIComponent(user.id)}`}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          View VMs
                        </Link>
                        <button
                          type="button"
                          disabled={actionId === `toggle:${user.id}`}
                          onClick={async () => {
                            setActionId(`toggle:${user.id}`);
                            try {
                              await setTenantUserActive(user.id, !user.isActive);
                              addToast(
                                'success',
                                `${user.email} ${user.isActive ? 'deactivated' : 'activated'}.`
                              );
                              await load();
                            } catch (err) {
                              addToast(
                                'error',
                                err instanceof ApiError
                                  ? err.message
                                  : 'Failed to update tenant user.'
                              );
                            } finally {
                              setActionId(null);
                            }
                          }}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 disabled:opacity-40"
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          disabled={actionId === `delete:${user.id}`}
                          onClick={async () => {
                            setActionId(`delete:${user.id}`);
                            try {
                              await deleteTenantUser(user.id);
                              addToast('success', `${user.email} deleted.`);
                              await load();
                            } catch (err) {
                              addToast(
                                'error',
                                err instanceof ApiError
                                  ? err.message
                                  : 'Failed to delete tenant user.'
                              );
                            } finally {
                              setActionId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
