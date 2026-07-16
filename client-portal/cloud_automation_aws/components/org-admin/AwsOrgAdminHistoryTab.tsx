'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../api/orgAdminClient';
import { getAwsOrgLabHistory } from '../../api/orgAdminClient';
import type { AwsOrgAdminLabHistory, AwsOrgAdminUser } from '../../types/orgAdmin';

export function AwsOrgAdminHistoryTab({
  requestId,
  users,
  refreshToken,
}: {
  requestId: string;
  users: AwsOrgAdminUser[];
  refreshToken?: string | number | null;
}) {
  const [history, setHistory] = useState<AwsOrgAdminLabHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userIndex, setUserIndex] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(
        await getAwsOrgLabHistory(requestId, {
          userIndex: userIndex === 'all' ? undefined : Number(userIndex),
          limit: 250,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AWS lab history.');
    } finally {
      setLoading(false);
    }
  }, [requestId, userIndex]);

  useEffect(() => {
    if (refreshToken == null) return;
    void load();
  }, [refreshToken, load]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !history) {
    return <div className="flex justify-center gap-2 px-6 py-16 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading history…</div>;
  }

  return (
    <div className="space-y-5 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <History className="h-4 w-4 text-[#B91C1C]" /> AWS Lab History
          </h3>
          <p className="mt-1 text-xs text-gray-500">Sessions, spend syncs, permission changes, and cleanup activity.</p>
        </div>
        <div className="flex gap-2">
          <select value={userIndex} onChange={(e) => setUserIndex(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="all">All users</option>
            {users.map((user) => <option key={user.userIndex} value={user.userIndex}>{user.username}</option>)}
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!history?.entries?.length ? (
        <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-gray-500">No history entries yet.</div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {history.entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                {entry.username && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{entry.username}</span>}
                <span className="text-xs text-gray-400">{new Date(entry.at).toLocaleString()}</span>
              </div>
              {entry.subtitle && <p className="mt-1 text-sm text-gray-600">{entry.subtitle}</p>}
              <div className="mt-1 flex gap-3 text-xs text-gray-500">
                {entry.costUsd != null && <span>Cost: {formatCurrency(entry.costUsd)}</span>}
                {entry.resourcesDeleted != null && <span>Deleted: {entry.resourcesDeleted}</span>}
                {entry.status && <span>Status: {entry.status}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
