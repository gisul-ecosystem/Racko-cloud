'use client';

import { useEffect, useState } from 'react';
import { Loader2, Server, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';

export interface ProjectElasticResourceRow {
  id: string;
  name: string;
  ipAddress: string;
  username: string;
  protocol: string;
  assignedUsers: Array<{ email: string | null; username: string | null }>;
}

function assignedLabel(users: ProjectElasticResourceRow['assignedUsers']): string {
  if (users.length === 0) return 'Unassigned';
  return users
    .map((u) => u.email || u.username)
    .filter(Boolean)
    .join(', ') || 'Assigned';
}

export function ProjectElasticResourcesModal({
  open,
  onClose,
  load,
}: {
  open: boolean;
  onClose: () => void;
  load: () => Promise<ProjectElasticResourceRow[]>;
}) {
  const [rows, setRows] = useState<ProjectElasticResourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void load()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load resources.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, load]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">External VM resources</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Servers and logins assigned to this project
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading resources…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Server className="mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">No servers assigned to this project yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-2 pr-3 font-semibold">Server</th>
                  <th className="pb-2 pr-3 font-semibold">VM username</th>
                  <th className="pb-2 font-semibold">Assigned user</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-gray-900">{row.ipAddress || '—'}</p>
                      {row.name && row.name !== row.ipAddress ? (
                        <p className="text-xs text-gray-400">{row.name}</p>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-gray-800">
                      {row.username || '—'}
                    </td>
                    <td className="py-2.5 text-gray-700">{assignedLabel(row.assignedUsers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
