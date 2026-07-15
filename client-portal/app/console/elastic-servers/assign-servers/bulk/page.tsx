'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../../context/AuthContext';
import { useManagedUsers } from '../../../../../hooks/useManagedUsers';
import {
  fetchAvailableExternalVMs,
  fetchExternalVMAssignCounts,
  bulkAssignExternalOneToOne,
  type IExternalVM,
  type BulkAssignExternalPairsResult,
} from '../../../../../lib/externalVmApi';
import { ApiError } from '../../../../../lib/apiClient';
import { ChevronLeft, Server, CheckSquare, Square, Loader2, Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

type UserMode = 'create' | 'existing';
type PasswordMode = 'auto' | 'shared';

const BASE = '/console/elastic-servers/assign-servers';

export default function BulkAssignExternalServersPage() {
  const { isAuthenticated } = useAuth();
  const { users, loading: usersLoading } = useManagedUsers(isAuthenticated);

  const [servers, setServers] = useState<IExternalVM[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkAssignExternalPairsResult | null>(null);

  const [userMode, setUserMode] = useState<UserMode>('create');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('auto');
  const [sharedPassword, setSharedPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const available = await fetchAvailableExternalVMs();
      setServers(available);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load servers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  const selectedList = useMemo(
    () => [...selectedIds].map((id) => servers.find((s) => s._id === id)).filter((s): s is IExternalVM => !!s),
    [servers, selectedIds]
  );

  const selectedUsers = useMemo(
    () => [...selectedUserIds].map((id) => users.find((u) => u.id === id)).filter(Boolean),
    [users, selectedUserIds]
  );

  const count = selectedIds.size;
  const countsMatch = userMode === 'create' ? count > 0 : count > 0 && count === selectedUserIds.size;

  const canSubmit =
    countsMatch &&
    (userMode === 'existing' ||
      (emailPrefix.includes('@') && (passwordMode === 'auto' || sharedPassword.length > 0)));

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const externalVmIds = selectedList.map((s) => s._id);
      const res = await bulkAssignExternalOneToOne(
        userMode === 'create'
          ? {
              externalVmIds,
              mode: 'create',
              emailPrefix: emailPrefix.toLowerCase().trim(),
              passwordMode,
              ...(passwordMode === 'shared' ? { sharedPassword } : {}),
            }
          : {
              externalVmIds,
              mode: 'existing',
              userIds: selectedUsers.map((u) => u!.id),
            }
      );
      setResult(res);
      setSelectedIds(new Set());
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
      ['Server', 'Email', 'Password', 'Status'],
      ...result.pairs.map((p) => [p.externalVmName, p.userEmail, p.password ?? '', p.status]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esi-bulk-assign-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl">
      <Link href={BASE} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ChevronLeft className="w-4 h-4" /> Back to Assign Servers
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Assign (1:1)</h1>
        <p className="text-gray-500 text-sm mt-0.5">Assign one imported server per user</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {result && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <span className="text-sm text-green-700 bg-green-50 px-3 py-1 rounded-lg">{result.assigned} assigned</span>
              {result.failed > 0 && (
                <span className="text-sm text-red-700 bg-red-50 px-3 py-1 rounded-lg">{result.failed} failed</span>
              )}
            </div>
            <button onClick={downloadCSV} className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm">
              <Download className="w-4 h-4" /> Download CSV
            </button>
          </div>
          <button onClick={() => setResult(null)} className="text-sm text-[#B91C1C]">Assign more</button>
        </div>
      )}

      {!result && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Select servers ({selectedIds.size} selected)</h2>
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-[#B91C1C]" />
            ) : servers.length === 0 ? (
              <p className="text-sm text-gray-500">No unassigned servers available.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {servers.map((s) => (
                  <label key={s._id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s._id)}
                      onChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          next.has(s._id) ? next.delete(s._id) : next.add(s._id);
                          return next;
                        });
                      }}
                    />
                    <Server className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-gray-400 font-mono ml-auto">{s.ipAddress}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUserMode('create')}
                className={`flex-1 py-2 text-sm rounded-lg border ${userMode === 'create' ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]' : 'border-gray-300'}`}
              >
                Create new users
              </button>
              <button
                type="button"
                onClick={() => setUserMode('existing')}
                className={`flex-1 py-2 text-sm rounded-lg border ${userMode === 'existing' ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]' : 'border-gray-300'}`}
              >
                Use existing users
              </button>
            </div>

            {userMode === 'create' ? (
              <>
                <input
                  type="email"
                  value={emailPrefix}
                  onChange={(e) => setEmailPrefix(e.target.value)}
                  placeholder="user@gmail.com → user1@gmail.com, user2@gmail.com…"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPasswordMode('auto')} className={`flex-1 py-2 text-sm rounded-lg border ${passwordMode === 'auto' ? 'border-[#B91C1C] bg-red-50' : ''}`}>Auto password</button>
                  <button type="button" onClick={() => setPasswordMode('shared')} className={`flex-1 py-2 text-sm rounded-lg border ${passwordMode === 'shared' ? 'border-[#B91C1C] bg-red-50' : ''}`}>Shared password</button>
                </div>
                {passwordMode === 'shared' && (
                  <input type="password" value={sharedPassword} onChange={(e) => setSharedPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Shared password" />
                )}
              </>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {usersLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  users.map((u) => (
                    <label key={u.id} className="flex items-center gap-3 p-2 border rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(u.id)}
                        disabled={!selectedUserIds.has(u.id) && selectedUserIds.size >= count && count > 0}
                        onChange={() => {
                          setSelectedUserIds((prev) => {
                            const next = new Set(prev);
                            next.has(u.id) ? next.delete(u.id) : count === 0 || next.size < count ? next.add(u.id) : next;
                            return next;
                          });
                        }}
                      />
                      <span className="text-sm">{u.email}</span>
                    </label>
                  ))
                )}
                {count > 0 && userMode === 'existing' && (
                  <p className="text-xs text-gray-500">Select exactly {count} user(s) to match selected servers.</p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full py-3 bg-[#B91C1C] hover:bg-red-700 disabled:bg-red-300 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitting ? 'Assigning...' : `Assign ${count} server${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}
