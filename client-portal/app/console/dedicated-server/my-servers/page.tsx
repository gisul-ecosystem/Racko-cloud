'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HardDrive, Loader2, Monitor, Plus } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchMyDedicatedServers,
  formatDedicatedStatus,
  type IDedicatedServer,
} from '@/lib/dedicatedServerApi';
import { ErrorState } from '@/components/dashboard/ErrorState';

function formatInr(n: number) {
  return `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function MyDedicatedServersPage() {
  const router = useRouter();
  const [servers, setServers] = useState<IDedicatedServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setServers(await fetchMyDedicatedServers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load servers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-screen-xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Servers</h1>
          <p className="mt-0.5 text-sm text-gray-500">Dedicated server requests for your account</p>
        </div>
        <Link
          href="/console/dedicated-server/request"
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#a01717]"
        >
          <Plus className="h-4 w-4" />
          Request Server
        </Link>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
            </div>
          ) : servers.length === 0 ? (
            <div className="p-12 text-center">
              <HardDrive className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-500">No dedicated servers yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-4 py-3">Specs</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((s) => {
                  const active = s.status === 'active';
                  const expanded = expandedId === s._id;
                  return (
                    <Fragment key={s._id}>
                      <tr className="border-b border-gray-50">
                        <td className="px-5 py-3.5 font-medium text-gray-900">{s.planName}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">
                          {s.specs.cpu} · {s.specs.ram} · {s.specs.disk}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                            {formatDedicatedStatus(s.status)}
                          </span>
                          {s.rejectionReason ? (
                            <p className="mt-1 max-w-xs text-xs text-red-600">{s.rejectionReason}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs">
                          {formatInr(s.monthlyPrice)}/mo
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {active ? (
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(
                                    `/console/dedicated-server/my-servers/${s._id}/console`
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white"
                              >
                                <Monitor className="h-3.5 w-3.5" />
                                Console
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedId((p) => (p === s._id ? null : s._id))
                                }
                                className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                              >
                                {expanded ? 'Hide' : 'Details'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                      {active && expanded ? (
                        <tr className="border-b border-green-100 bg-green-50/40">
                          <td colSpan={5} className="px-5 py-3 font-mono text-xs text-gray-700">
                            {s.hostname ? `${s.hostname} · ` : ''}
                            {s.ipAddress || '—'} · {s.username || '—'} · {s.protocol || '—'}
                            {s.password ? ` · ${s.password}` : ''}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
