'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, User } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchDedicatedRequesters,
  type DedicatedRequesterGroup,
} from '@/lib/dedicatedServerApi';
import { ErrorState } from '@/components/dashboard/ErrorState';

export default function DedicatedServerRequestsPage() {
  const [requesters, setRequesters] = useState<DedicatedRequesterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequesters(await fetchDedicatedRequesters());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load requesters.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-screen-xl p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Dedicated Server Request</h1>
      <p className="mt-1 text-sm text-gray-500">
        Requests from platform admins. Open a card to attach or reject.
      </p>

      {error && !loading && (
        <div className="mt-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      ) : requesters.length === 0 ? (
        <p className="mt-10 text-sm text-gray-500">No dedicated server requests yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requesters.map((r) => (
            <Link
              key={r.adminId}
              href={`/super-admin-console/dedicated-server-requests/${r.adminId}`}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#B91C1C]"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                <User className="h-5 w-5" />
              </div>
              <p className="font-semibold text-gray-900">{r.adminEmail}</p>
              <p className="mt-1 text-xs text-gray-500">
                {r.pendingCount} pending · {r.totalCount} total
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
