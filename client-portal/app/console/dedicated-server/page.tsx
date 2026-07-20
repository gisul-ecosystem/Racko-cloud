'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  HardDrive,
  Loader2,
  Monitor,
  Plus,
  Server,
  XCircle,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchDedicatedPlans,
  fetchMyDedicatedServers,
  formatDedicatedStatus,
  type IDedicatedServer,
} from '@/lib/dedicatedServerApi';
import { ErrorState } from '@/components/dashboard/ErrorState';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatInr(amount: number | undefined | null): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: 'red' | 'green' | 'amber' | 'blue';
}) {
  const toneClass = {
    red: 'bg-red-50 text-[#B91C1C]',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
  }[tone];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: IDedicatedServer['status'] }) {
  const styles: Record<IDedicatedServer['status'], string> = {
    provisioning: 'bg-amber-50 text-amber-700 border-amber-200',
    active: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
    cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
    suspended: 'bg-orange-50 text-orange-700 border-orange-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {formatDedicatedStatus(status)}
    </span>
  );
}

export default function DedicatedServerOverviewPage() {
  const [servers, setServers] = useState<IDedicatedServer[]>([]);
  const [planCount, setPlanCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [serverList, plans] = await Promise.all([
        fetchMyDedicatedServers(),
        fetchDedicatedPlans(),
      ]);
      setServers(serverList);
      setPlanCount(plans.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const active = servers.filter((s) => s.status === 'active').length;
    const pending = servers.filter((s) => s.status === 'provisioning').length;
    const rejected = servers.filter((s) => s.status === 'rejected').length;
    return {
      total: servers.length,
      active,
      pending,
      rejected,
    };
  }, [servers]);

  const recent = useMemo(() => servers.slice(0, 5), [servers]);

  return (
    <div className="max-w-screen-xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-[#B91C1C]">
            <HardDrive className="h-3.5 w-3.5" />
            Bare-metal infrastructure
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Overview</h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            Browse bare-metal plans, submit a request, and track provisioning until your server is
            attached.
          </p>
        </div>
        <Link
          href="/console/dedicated-server/request"
          className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a01717]"
        >
          <Plus className="h-4 w-4" />
          Request Server
        </Link>
      </div>

      {error && !loading ? <ErrorState message={error} onRetry={load} /> : null}

      {!error ? (
        <>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Available plans"
                  value={planCount}
                  icon={<HardDrive className="h-6 w-6" />}
                  tone="red"
                />
                <StatCard
                  label="My servers"
                  value={stats.total}
                  icon={<Server className="h-6 w-6" />}
                  tone="blue"
                />
                <StatCard
                  label="Active"
                  value={stats.active}
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  tone="green"
                />
                <StatCard
                  label="Provisioning"
                  value={stats.pending}
                  icon={<Clock className="h-6 w-6" />}
                  tone="amber"
                />
              </div>

              <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                  <h2 className="text-base font-semibold text-gray-900">Recent requests</h2>
                  <Link
                    href="/console/dedicated-server/my-servers"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#B91C1C] hover:text-[#DC2626]"
                  >
                    View all
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {recent.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                      <Server className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-600">No dedicated servers yet</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Pick a plan from the catalog and submit your first request.
                    </p>
                    <Link
                      href="/console/dedicated-server/request"
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white"
                    >
                      <Plus className="h-4 w-4" />
                      Browse plans
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Plan
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Charged
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Requested
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((s, index) => (
                          <tr
                            key={s._id}
                            className={`border-b border-gray-50 transition hover:bg-gray-50 ${
                              index % 2 !== 0 ? 'bg-gray-50/40' : ''
                            }`}
                          >
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                                  <HardDrive className="h-4 w-4" />
                                </span>
                                <div>
                                  <p className="font-medium text-gray-900 line-clamp-1">
                                    {s.planName}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {s.specs.cpu} · {s.specs.ram}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <StatusBadge status={s.status} />
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs text-gray-600">
                              {formatInr(s.chargedAmount)}
                            </td>
                            <td className="px-4 py-3.5 text-gray-500">
                              {formatDateTime(s.createdAt)}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              {s.status === 'active' ? (
                                <Link
                                  href={`/console/dedicated-server/my-servers/${s._id}/console`}
                                  className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white"
                                >
                                  <Monitor className="h-3.5 w-3.5" />
                                  Console
                                </Link>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-4">
                  <h2 className="text-base font-semibold text-gray-900">Quick actions</h2>
                </div>
                <div className="grid gap-px bg-gray-100 sm:grid-cols-2">
                  <Link
                    href="/console/dedicated-server/request"
                    className="flex items-start gap-4 bg-white px-6 py-5 transition hover:bg-gray-50"
                  >
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
                      <Plus className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Request a server</p>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">
                        Browse {planCount > 0 ? `${planCount} bare-metal plans` : 'available plans'}.
                        First month + setup fee charged from wallet (incl. 18% GST).
                      </p>
                    </div>
                  </Link>
                  <Link
                    href="/console/dedicated-server/my-servers"
                    className="flex items-start gap-4 bg-white px-6 py-5 transition hover:bg-gray-50"
                  >
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
                      <Server className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">My servers</p>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">
                        {stats.total > 0
                          ? `${stats.active} active · ${stats.pending} provisioning${
                              stats.rejected > 0 ? ` · ${stats.rejected} rejected` : ''
                            }.`
                          : 'Track requests and open console once super-admin attaches your machine.'}
                      </p>
                    </div>
                  </Link>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white px-5 py-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    Provisioning after payment
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    Console access when active
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    Refund on rejection
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
