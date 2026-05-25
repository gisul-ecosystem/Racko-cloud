'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { useManagedUsers } from '../../../../hooks/useManagedUsers';
import { setUserActive, deleteUser } from '../../../../lib/managedUsersApi';
import { ApiError } from '../../../../lib/apiClient';
import { Users, Plus, Trash2, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react';

export default function UsersPage() {
  const { isAuthenticated } = useAuth();
  const { users, loading, error, refetch } = useManagedUsers(isAuthenticated);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const allSelected = users.length > 0 && selected.size === users.length;
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleToggleActive(userId: string, current: boolean) {
    setLoadingId(userId);
    setActionError(null);
    try {
      await setUserActive(userId, !current);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update user.');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(userId: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    setLoadingId(userId);
    setActionError(null);
    try {
      await deleteUser(userId);
      setSelected((prev) => { const n = new Set(prev); n.delete(userId); return n; });
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete user.');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} selected user${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    setActionError(null);
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => deleteUser(id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      setActionError(`${failed} user${failed !== 1 ? 's' : ''} could not be deleted.`);
    }
    setSelected(new Set());
    setBulkDeleting(false);
    refetch();
  }

  return (
    <div className="max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage users you have created</p>
        </div>
        <Link
          href="/dashboard/admin/users/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create User
        </Link>
      </div>

      {actionError && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {actionError}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Table header with bulk action bar */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between min-h-[56px]">
          {someSelected ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                {selected.size} selected
              </span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-xs font-medium rounded-lg transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {bulkDeleting ? 'Deleting...' : `Delete ${selected.size}`}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-gray-700 transition"
              >
                Clear selection
              </button>
            </div>
          ) : (
            <h2 className="text-sm font-semibold text-gray-900">
              {loading ? 'Loading...' : `${users.length} user${users.length !== 1 ? 's' : ''}`}
            </h2>
          )}
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-red-500">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm font-medium">No users yet</p>
            <p className="text-gray-400 text-xs mt-1">Create your first user to get started</p>
            <Link
              href="/dashboard/admin/users/create"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Create User
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${selected.has(user.id) ? 'bg-blue-50/40' : ''}`}
                  >
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selected.has(user.id)}
                        onChange={() => toggleOne(user.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3.5 font-medium text-gray-900">{user.email}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleActive(user.id, user.isActive)}
                          disabled={loadingId === user.id || bulkDeleting}
                          title={user.isActive ? 'Deactivate' : 'Activate'}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-40"
                        >
                          {user.isActive
                            ? <ToggleRight className="w-4 h-4 text-green-500" />
                            : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(user.id, user.email)}
                          disabled={loadingId === user.id || bulkDeleting}
                          title="Delete user"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
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
