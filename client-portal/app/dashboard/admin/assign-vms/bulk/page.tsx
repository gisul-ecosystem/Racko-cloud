'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../../context/AuthContext';
import { useManagedUsers } from '../../../../../hooks/useManagedUsers';
import {
  fetchAvailableVMs,
  fetchAssignedVMCounts,
  bulkAssignOneToOne,
  type IVM,
  type BulkAssignPairsResult,
} from '../../../../../lib/vmApi';
import { ApiError } from '../../../../../lib/apiClient';
import {
  ChevronLeft,
  Server,
  CheckSquare,
  Square,
  Loader2,
  UserPlus,
  Users,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';

type UserMode = 'create' | 'existing';
type PasswordMode = 'auto' | 'shared';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: 'bg-green-100 text-green-700',
    stopped: 'bg-gray-100 text-gray-600',
    paused: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

export default function BulkAssignPage() {
  const { isAuthenticated } = useAuth();
  const { users, loading: usersLoading } = useManagedUsers(isAuthenticated);

  const [vms, setVms] = useState<IVM[]>([]);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [selectedVmIds, setSelectedVmIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loadingVms, setLoadingVms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkAssignPairsResult | null>(null);

  const [userMode, setUserMode] = useState<UserMode>('create');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('auto');
  const [sharedPassword, setSharedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    setLoadingVms(true);
    setError(null);
    try {
      const [available, counts] = await Promise.all([
        fetchAvailableVMs(),
        fetchAssignedVMCounts(),
      ]);
      setVms(available);
      setAssignedCounts(counts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VMs.');
    } finally {
      setLoadingVms(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  const selectedVmList = useMemo(
    () =>
      [...selectedVmIds]
        .map((id) => vms.find((vm) => vm._id === id))
        .filter((vm): vm is IVM => vm !== undefined),
    [vms, selectedVmIds]
  );

  const selectedUserList = useMemo(
    () =>
      [...selectedUserIds]
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is (typeof users)[number] => u !== undefined),
    [users, selectedUserIds]
  );

  const vmCount = selectedVmIds.size;
  const userCount = userMode === 'create' ? vmCount : selectedUserIds.size;
  const countsMatch = vmCount > 0 && vmCount === userCount;

  const allVmsSelected = vms.length > 0 && selectedVmIds.size === vms.length;
  const someVmsSelected = selectedVmIds.size > 0 && !allVmsSelected;

  function toggleVm(vmId: string) {
    setSelectedVmIds((prev) => {
      const next = new Set(prev);
      if (next.has(vmId)) next.delete(vmId);
      else next.add(vmId);
      return next;
    });
    setResult(null);
  }

  function toggleAllVms() {
    if (allVmsSelected) setSelectedVmIds(new Set());
    else setSelectedVmIds(new Set(vms.map((vm) => vm._id)));
    setResult(null);
  }

  function toggleUser(userId: string) {
    if (vmCount === 0) return;
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else if (next.size < vmCount) {
        next.add(userId);
      }
      return next;
    });
    setResult(null);
  }

  useEffect(() => {
    if (userMode !== 'existing') return;
    setSelectedUserIds((prev) => {
      if (prev.size <= vmCount) return prev;
      return new Set([...prev].slice(0, vmCount));
    });
  }, [vmCount, userMode]);

  const previewPairs = useMemo(() => {
    if (!countsMatch) return [];
    if (userMode === 'create') {
      const atIdx = emailPrefix.lastIndexOf('@');
      if (atIdx <= 0) return [];
      const local = emailPrefix.slice(0, atIdx);
      const domain = emailPrefix.slice(atIdx);
      return selectedVmList.map((vm, i) => ({
        vmName: vm.name,
        userEmail: `${local}${i + 1}${domain}`,
      }));
    }
    return selectedVmList.map((vm, i) => ({
      vmName: vm.name,
      userEmail: selectedUserList[i]?.email ?? '—',
    }));
  }, [countsMatch, userMode, emailPrefix, selectedVmList, selectedUserList]);

  const canSubmit =
    countsMatch &&
    (userMode === 'existing' ||
      (emailPrefix.includes('@') && (passwordMode === 'auto' || sharedPassword.length > 0)));

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const vmIds = selectedVmList.map((vm) => vm._id);
      const res = await bulkAssignOneToOne(
        userMode === 'create'
          ? {
              vmIds,
              mode: 'create',
              emailPrefix: emailPrefix.toLowerCase().trim(),
              passwordMode,
              ...(passwordMode === 'shared' ? { sharedPassword } : {}),
            }
          : {
              vmIds,
              mode: 'existing',
              userIds: selectedUserList.map((u) => u.id),
            }
      );
      setResult(res);
      setSelectedVmIds(new Set());
      setSelectedUserIds(new Set());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bulk assign failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function downloadCSV() {
    if (!result) return;
    const rows = [
      ['VM', 'Email', 'Password', 'Status'],
      ...result.pairs.map((p) => [p.vmName, p.userEmail, p.password ?? '', p.status]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-assign-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/admin/assign-vms"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Assign VMs
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Assign (1:1)</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Select unassigned VMs and assign exactly one VM per user. Use Manage VMs to add more VMs later.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
                <CheckCircle className="w-4 h-4" />
                {result.assigned} assigned
              </span>
              {result.failed > 0 && (
                <span className="inline-flex items-center gap-1.5 text-sm text-red-700 bg-red-50 px-3 py-1.5 rounded-lg">
                  <XCircle className="w-4 h-4" />
                  {result.failed} failed
                </span>
              )}
            </div>
            {result.pairs.some((p) => p.password) && (
              <button
                type="button"
                onClick={downloadCSV}
                className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </button>
            )}
          </div>
          {result.pairs.some((p) => p.password) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
              Save these credentials now — passwords are shown once and cannot be retrieved later.
            </p>
          )}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">VM</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">User</th>
                  {result.pairs.some((p) => p.password) && (
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Password</th>
                  )}
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.pairs.map((p) => (
                  <tr key={p.vmId} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{p.vmName}</td>
                    <td className="px-4 py-2.5 text-gray-700">{p.userEmail}</td>
                    {result.pairs.some((row) => row.password) && (
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{p.password ?? '—'}</td>
                    )}
                    <td className="px-4 py-2.5">
                      {p.status === 'assigned' ? (
                        <span className="text-green-600 text-xs font-medium">Assigned</span>
                      ) : (
                        <span className="text-red-500 text-xs" title={p.error}>Failed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="text-sm text-[#B91C1C] hover:text-[#DC2626] font-medium"
          >
            Run another bulk assign
          </button>
        </div>
      )}

      {/* VMs */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allVmsSelected}
              ref={(el) => {
                if (el) el.indeterminate = someVmsSelected;
              }}
              onChange={toggleAllVms}
              disabled={loadingVms || vms.length === 0}
              className="rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
            />
            <span className="font-medium">
              {loadingVms ? 'Loading…' : `Unassigned VMs — ${selectedVmIds.size} of ${vms.length} selected`}
            </span>
          </label>
        </div>
        {loadingVms ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : vms.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No unassigned VMs available.</p>
        ) : (
          <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {vms.map((vm) => {
              const isOn = selectedVmIds.has(vm._id);
              return (
                <li key={vm._id}>
                  <label className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggleVm(vm._id)}
                      className="rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C] shrink-0"
                    />
                    <Server className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{vm.name}</p>
                      <p className="text-xs text-gray-400 font-mono">#{vm.vmid} · {vm.allocatedCpu} vCPU · {vm.allocatedMemoryGb} GB RAM</p>
                    </div>
                    <StatusBadge status={vm.status} />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Users */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="flex border-b border-gray-100">
          <button
            type="button"
            onClick={() => { setUserMode('create'); setSelectedUserIds(new Set()); setResult(null); }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition ${
              userMode === 'create'
                ? 'text-[#B91C1C] border-b-2 border-[#B91C1C] bg-red-50/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Create users
          </button>
          <button
            type="button"
            onClick={() => { setUserMode('existing'); setResult(null); }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition ${
              userMode === 'existing'
                ? 'text-[#B91C1C] border-b-2 border-[#B91C1C] bg-red-50/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            Existing users
          </button>
        </div>

        <div className="p-5">
          {vmCount === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Select at least one VM above.</p>
          ) : userMode === 'create' ? (
            <div className="space-y-4 max-w-md">
              <p className="text-xs text-gray-500">
                Will create <strong>{vmCount}</strong> user{vmCount !== 1 ? 's' : ''} (one per selected VM).
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email prefix</label>
                <input
                  type="email"
                  value={emailPrefix}
                  onChange={(e) => setEmailPrefix(e.target.value)}
                  placeholder="viju@gmail.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
                />
                <p className="text-xs text-gray-400 mt-1">
                  e.g. viju@gmail.com → viju1@gmail.com, viju2@gmail.com, …
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Password</label>
                <div className="flex gap-3 mb-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={passwordMode === 'auto'}
                      onChange={() => setPasswordMode('auto')}
                      className="text-[#B91C1C] focus:ring-[#B91C1C]"
                    />
                    Unique auto-generated
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={passwordMode === 'shared'}
                      onChange={() => setPasswordMode('shared')}
                      className="text-[#B91C1C] focus:ring-[#B91C1C]"
                    />
                    Same for all
                  </label>
                </div>
                {passwordMode === 'shared' && (
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={sharedPassword}
                      onChange={(e) => setSharedPassword(e.target.value)}
                      placeholder="Shared password"
                      className="w-full px-3 py-2 pr-16 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : usersLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No users yet. Create users first or use the Create users tab.</p>
          ) : (
            <div>
              <p className="text-xs text-gray-500 mb-3">
                Select <strong>{vmCount}</strong> user{vmCount !== 1 ? 's' : ''} ({selectedUserIds.size} selected).
              </p>
              <ul className="divide-y divide-gray-50 max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
                {users.map((user) => {
                  const isOn = selectedUserIds.has(user.id);
                  const atCap = !isOn && selectedUserIds.size >= vmCount;
                  const vmAssigned = assignedCounts[user.id] ?? 0;
                  return (
                    <li key={user.id}>
                      <label
                        className={`flex items-center gap-3 px-4 py-3 transition ${
                          atCap ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isOn}
                          disabled={atCap}
                          onChange={() => toggleUser(user.id)}
                          className="rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                          <p className="text-xs text-gray-400">
                            {vmAssigned} VM{vmAssigned !== 1 ? 's' : ''} assigned
                            {!user.isActive && ' · Inactive'}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {previewPairs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Preview (1:1)</h2>
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">#</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">VM</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">User</th>
                </tr>
              </thead>
              <tbody>
                {previewPairs.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{row.vmName}</td>
                    <td className="px-4 py-2 text-gray-700">{row.userEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vmCount > 0 && userMode === 'existing' && selectedUserIds.size !== vmCount && (
        <p className="text-xs text-amber-600 mb-4">
          Select exactly {vmCount} user{vmCount !== 1 ? 's' : ''} to match selected VMs.
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={!canSubmit || submitting || !!result}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B91C1C] hover:bg-[#DC2626] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Assigning…
          </>
        ) : (
          <>
            <CheckSquare className="w-4 h-4" />
            Assign {vmCount > 0 ? `${vmCount} VM${vmCount !== 1 ? 's' : ''}` : ''}
          </>
        )}
      </button>
    </div>
  );
}
