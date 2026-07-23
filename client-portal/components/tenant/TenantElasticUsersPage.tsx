'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Trash2, UserPlus, Users } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiClient';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import {
  bulkDeleteTenantUsers,
  deleteTenantUser,
  fetchTenantUsers,
  setTenantUserActive,
} from '@/lib/tenantVmApi';
import { fetchTenantExternalVMAssignCounts } from '@/lib/tenantExternalVmApi';
import type { TenantUserProfile } from '@/types/tenantPortal';

export function TenantElasticUsersPage() {
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();

  const [users, setUsers] = useState<TenantUserProfile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantUserProfile | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersResult, assignCounts] = await Promise.all([
        fetchTenantUsers(),
        fetchTenantExternalVMAssignCounts(),
      ]);
      setUsers(usersResult.users);
      setCounts(assignCounts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(users.map((u) => u.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [users]);

  const allSelected = users.length > 0 && selectedIds.size === users.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)),
    [users, selectedIds]
  );

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(users.map((u) => u.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleActive = async (user: TenantUserProfile) => {
    setActionId(user.id);
    try {
      await setTenantUserActive(user.id, !user.isActive);
      addToast('success', user.isActive ? 'User deactivated.' : 'User activated.');
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to update user.');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionId(deleteTarget.id);
    try {
      await deleteTenantUser(deleteTarget.id);
      addToast('success', 'User deleted and server assignment cleared.');
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete user.');
    } finally {
      setActionId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const chunkSize = 250;
      let deleted = 0;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const result = await bulkDeleteTenantUsers(chunk);
        deleted += result.deleted;
      }
      addToast(
        'success',
        `${deleted} user${deleted === 1 ? '' : 's'} deleted.`
      );
      setSelectedIds(new Set());
      setPendingBulkDelete(false);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete users.');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {deleteTarget ? (
        <ConfirmModal
          open
          title="Delete user"
          description={`Delete ${deleteTarget.email}? This will remove the user and free their assigned servers.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          loading={actionId === deleteTarget.id}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      {pendingBulkDelete ? (
        <ConfirmModal
          open
          title="Delete selected users"
          description={`Permanently remove ${selectedUsers.length} user${
            selectedUsers.length === 1 ? '' : 's'
          } and clear their server assignments? This cannot be undone.`}
          confirmLabel={`Delete ${selectedUsers.length}`}
          confirmVariant="danger"
          loading={bulkDeleting}
          onConfirm={() => void handleBulkDelete()}
          onCancel={() => setPendingBulkDelete(false)}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">
            Shared tenant users for VPS and Elastic Server Import
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {users.length > 0 ? (
            <>
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || bulkDeleting}
                onClick={() => setPendingBulkDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </button>
            </>
          ) : null}
          <Link
            href={tenantConsole.elasticUsersCreate}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={tenantAccentButton(accentColor)}
          >
            <UserPlus className="h-4 w-4" />
            Create User
          </Link>
        </div>
      </div>

      {error && !loading ? (
        <ErrorState title="Users unavailable" message={error} onRetry={() => void load()} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={5} cols={6} embedded />
          ) : users.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700">No users yet</p>
              <p className="mt-1 text-sm text-gray-500">Create users to assign imported servers.</p>
              <Link
                href={tenantConsole.elasticUsersCreate}
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={tenantAccentButton(accentColor)}
              >
                <UserPlus className="h-4 w-4" />
                Create User
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleAll}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300"
                        aria-label="Select all users"
                      />
                    </th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned Servers</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => {
                    const serverCount = counts[user.id] ?? 0;
                    const isSelected = selectedIds.has(user.id);
                    return (
                      <tr
                        key={user.id}
                        className={`border-b border-gray-50 ${
                          isSelected ? 'bg-blue-50/60' : i % 2 !== 0 ? 'bg-gray-50/40' : ''
                        }`}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(user.id)}
                            className="h-4 w-4 cursor-pointer rounded border-gray-300"
                            aria-label={`Select ${user.email}`}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{user.email}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              user.isActive
                                ? 'bg-green-50 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {serverCount > 0 ? (
                            `${serverCount} server${serverCount === 1 ? '' : 's'}`
                          ) : (
                            <span className="text-gray-400">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={actionId === user.id || bulkDeleting}
                              onClick={() => void handleToggleActive(user)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs disabled:opacity-40"
                            >
                              {actionId === user.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : user.isActive ? (
                                'Deactivate'
                              ) : (
                                'Activate'
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={actionId === user.id || bulkDeleting}
                              onClick={() => setDeleteTarget(user)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-40"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
