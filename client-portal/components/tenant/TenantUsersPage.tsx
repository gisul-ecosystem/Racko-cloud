'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Trash2, UserPlus, Users } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiClient';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import {
  deleteTenantUser,
  fetchTenantAssignCounts,
  fetchTenantUsers,
  setTenantUserActive,
} from '@/lib/tenantVmApi';
import type { TenantUserProfile } from '@/types/tenantPortal';

export function TenantUsersPage() {
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();

  const [users, setUsers] = useState<TenantUserProfile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantUserProfile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersResult, assignCounts] = await Promise.all([
        fetchTenantUsers(),
        fetchTenantAssignCounts(),
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
      addToast('success', 'User deleted and VM assignment cleared.');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete user.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {deleteTarget ? (
        <ConfirmModal
          open
          title="Delete user"
          description={`Delete ${deleteTarget.email}? This will remove the user and free their VM.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          loading={actionId === deleteTarget.id}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Tenant users</h1>
          <p className="text-sm text-gray-500">
            Manage users you created via onboard. To add users, onboard them onto VMs.
          </p>
        </div>
        <Link
          href="/tenant/dashboard/admin/assign-vms"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={tenantAccentButton(accentColor)}
        >
          <UserPlus className="h-4 w-4" />
          Onboard VMs
        </Link>
      </div>

      {error && !loading ? (
        <ErrorState title="Users unavailable" message={error} onRetry={() => void load()} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={5} cols={5} embedded />
          ) : users.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
                <Users className="h-7 w-7 text-gray-400" />
              </div>
              <p className="font-medium text-gray-700">No users yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Onboard VMs to create tenant users with 1:1 VM assignments.
              </p>
              <Link
                href="/tenant/dashboard/admin/assign-vms"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#B91C1C] hover:underline"
              >
                <UserPlus className="h-4 w-4" />
                Onboard VMs
              </Link>
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
                  {users.map((user) => {
                    const vmCount = counts[user.id] ?? 0;
                    return (
                      <tr key={user.id} className="border-b border-gray-50">
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
                          {vmCount > 0 ? (
                            <Link
                              href={`/tenant/dashboard/admin/vms?userId=${user.id}`}
                              className="text-[#B91C1C] hover:underline"
                            >
                              {vmCount} VM{vmCount === 1 ? '' : 's'}
                            </Link>
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
                              disabled={actionId === user.id}
                              onClick={() => void handleToggleActive(user)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 disabled:opacity-40"
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
                              disabled={actionId === user.id}
                              onClick={() => setDeleteTarget(user)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-40"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
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
