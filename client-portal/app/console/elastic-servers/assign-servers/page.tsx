'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { useManagedUsers } from '../../../../hooks/useManagedUsers';
import {
  fetchAvailableExternalVMs,
  fetchAssignedExternalVMsForUser,
  fetchExternalVMAssignCounts,
  assignExternalVMs,
  unassignExternalVM,
  type IExternalVM,
} from '../../../../lib/externalVmApi';
import { ApiError } from '../../../../lib/apiClient';
import {
  UserCheck,
  X,
  Server,
  CheckSquare,
  Square,
  AlertCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';

const BASE = '/console/elastic-servers';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    rdp: 'bg-blue-100 text-blue-700',
    ssh: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium uppercase ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function ServerCard({
  vm,
  selectable,
  selected,
  onToggle,
  action,
  actionLabel,
  actionLoading,
}: {
  vm: IExternalVM;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  action?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
        selectable
          ? selected
            ? 'border-blue-400 bg-blue-50 cursor-pointer'
            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer'
          : 'border-gray-200 bg-white'
      }`}
      onClick={selectable ? onToggle : undefined}
    >
      {selectable && (
        <span className="shrink-0 text-blue-600">
          {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-gray-400" />}
        </span>
      )}
      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
        <Server className="w-4 h-4 text-[#B91C1C]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{vm.name}</p>
        <p className="text-xs text-gray-400 mt-0.5 font-mono">{vm.ipAddress}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={vm.protocol} />
        {action && (
          <button
            onClick={(e) => { e.stopPropagation(); action(); }}
            disabled={actionLoading}
            className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-40 font-medium"
          >
            {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function AssignDrawer({
  userId,
  userEmail,
  onClose,
  onChanged,
}: {
  userId: string;
  userEmail: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [assigned, setAssigned] = useState<IExternalVM[]>([]);
  const [available, setAvailable] = useState<IExternalVM[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assignedList, availableList] = await Promise.all([
        fetchAssignedExternalVMsForUser(userId),
        fetchAvailableExternalVMs(),
      ]);
      setAssigned(assignedList);
      setAvailable(availableList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load servers.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAssign() {
    if (selected.size === 0) return;
    setAssigning(true);
    setError(null);
    try {
      await assignExternalVMs(userId, Array.from(selected));
      setSelected(new Set());
      onChanged();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign servers.');
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(id: string) {
    setUnassigningId(id);
    setError(null);
    try {
      await unassignExternalVM(id);
      onChanged();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to unassign server.');
    } finally {
      setUnassigningId(null);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Manage Servers</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[340px]">{userEmail}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-[#B91C1C] animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Assigned ({assigned.length})
              </h3>
              {assigned.length === 0 ? (
                <p className="text-sm text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                  No servers assigned yet
                </p>
              ) : (
                <div className="space-y-2">
                  {assigned.map((vm) => (
                    <ServerCard
                      key={vm._id}
                      vm={vm}
                      action={() => handleUnassign(vm._id)}
                      actionLabel="Unassign"
                      actionLoading={unassigningId === vm._id}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Available to assign ({available.length})
              </h3>
              {available.length === 0 ? (
                <p className="text-sm text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                  No available servers — import more or unassign existing ones
                </p>
              ) : (
                <div className="space-y-2">
                  {available.map((vm) => (
                    <ServerCard
                      key={vm._id}
                      vm={vm}
                      selectable
                      selected={selected.has(vm._id)}
                      onToggle={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          next.has(vm._id) ? next.delete(vm._id) : next.add(vm._id);
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {!loading && available.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {selected.size > 0 ? `${selected.size} selected` : 'Select servers to assign'}
            </span>
            <button
              onClick={handleAssign}
              disabled={selected.size === 0 || assigning}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#B91C1C] hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg transition"
            >
              {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              {assigning ? 'Assigning...' : `Assign ${selected.size > 0 ? selected.size : ''} server${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default function AssignExternalServersPage() {
  const { isAuthenticated } = useAuth();
  const { users, loading, error } = useManagedUsers(isAuthenticated);
  const [drawerUser, setDrawerUser] = useState<{ id: string; email: string } | null>(null);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});

  const loadCounts = useCallback(async () => {
    if (users.length === 0) return;
    try {
      const counts = await fetchExternalVMAssignCounts();
      setAssignedCounts(counts);
    } catch {
      // non-critical
    }
  }, [users]);

  useEffect(() => { void loadCounts(); }, [loadCounts]);

  return (
    <div className="max-w-screen-xl">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assign Servers</h1>
          <p className="text-gray-500 text-sm mt-0.5">Assign imported servers to users</p>
        </div>
        <Link
          href={`${BASE}/assign-servers/bulk`}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#B91C1C] bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition shrink-0"
        >
          Bulk assign (1:1)
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {loading ? 'Loading...' : `${users.length} user${users.length !== 1 ? 's' : ''}`}
          </h2>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-red-500">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <UserCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium">No users yet</p>
            <p className="text-gray-400 text-xs mt-1">
              <Link href={`${BASE}/users/create`} className="text-[#B91C1C] hover:underline">Create users</Link> first to assign servers
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned Servers</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                        <Server className="w-3.5 h-3.5 text-gray-400" />
                        {assignedCounts[user.id] ?? 0} server{(assignedCounts[user.id] ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setDrawerUser({ id: user.id, email: user.email })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-medium rounded-lg transition"
                      >
                        Manage Servers
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerUser && (
        <AssignDrawer
          userId={drawerUser.id}
          userEmail={drawerUser.email}
          onClose={() => setDrawerUser(null)}
          onChanged={loadCounts}
        />
      )}
    </div>
  );
}
