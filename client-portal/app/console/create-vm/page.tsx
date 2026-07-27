'use client';

import Link from 'next/link';
import { useVmCatalogOverview } from '../../../hooks/useVmCatalogOverview';
import { useVmCatalogPortal } from '../../../context/VmCatalogPortalContext';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import {
  catalogVmStatusNote,
  catalogVmStatusTone,
  formatCatalogVmStatus,
  type ICatalogVm,
  type VmCatalogCategory,
} from '../../../lib/vmCatalogApi';
import { Clock, Monitor, Plus, Server, Terminal } from 'lucide-react';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatInr(amount: number | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `₹ ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'red' | 'blue' | 'green' | 'amber';
}) {
  const toneClass = {
    red: 'bg-red-50 text-[#B91C1C]',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tone];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function CategoryBadge({ category }: { category: VmCatalogCategory }) {
  const styles: Record<string, string> = {
    ubuntu: 'bg-orange-50 text-orange-700 border-orange-200',
    rocky: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    debian: 'bg-pink-50 text-pink-700 border-pink-200',
    linux: 'bg-green-50 text-green-700 border-green-200',
    windows: 'bg-blue-50 text-blue-700 border-blue-200',
    gpu: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${styles[category] || styles.linux}`}
    >
      {category}
    </span>
  );
}

function StatusBadge({ status }: { status: ICatalogVm['status'] }) {
  const tone = catalogVmStatusTone(status);
  const note = catalogVmStatusNote(status);
  const styles = {
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }[tone];

  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}
      >
        {formatCatalogVmStatus(status)}
      </span>
      {note ? <p className="text-xs text-gray-500">{note}</p> : null}
    </div>
  );
}

export default function VmCatalogOverviewPage() {
  const { routes } = useVmCatalogPortal();
  const { overview, loading, error, refetch } = useVmCatalogOverview();

  const stats = overview?.stats ?? {
    total: 0,
    active: 0,
    pending: 0,
    linux: 0,
    windows: 0,
    gpu: 0,
  };
  const recent = overview?.recent ?? [];

  return (
    <div className="max-w-screen-xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Browse catalog plans, request VMs, and track your instances
          </p>
        </div>
        <Link
          href={routes.create}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717]"
        >
          <Plus className="h-4 w-4" />
          Create VM
        </Link>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {!error && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Total VMs"
              value={stats.total}
              icon={<Server className="h-6 w-6" />}
              tone="red"
            />
            <StatCard
              label="Active"
              value={stats.active}
              icon={<Monitor className="h-6 w-6" />}
              tone="green"
            />
            <StatCard
              label="Pending"
              value={stats.pending}
              icon={<Clock className="h-6 w-6" />}
              tone="amber"
            />
            <StatCard
              label="Linux"
              value={stats.linux}
              icon={<Terminal className="h-6 w-6" />}
              tone="green"
            />
            <StatCard
              label="Windows"
              value={stats.windows}
              icon={<Monitor className="h-6 w-6" />}
              tone="blue"
            />
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Recent VMs</h2>
              <Link
                href={routes.myVms}
                className="text-xs font-medium text-[#B91C1C] hover:text-[#DC2626]"
              >
                View all
              </Link>
            </div>

            {loading ? (
              <TableSkeleton rows={5} cols={5} embedded />
            ) : recent.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <Server className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-500">No catalog VMs yet</p>
                <p className="mt-1 text-xs text-gray-400">
                  Submit a request from Create VM to get started.
                </p>
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
                        Category
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Requested
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((vm, index) => (
                      <tr
                        key={vm._id}
                        className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                          index % 2 !== 0 ? 'bg-gray-50/40' : ''
                        }`}
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                              <Server className="h-4 w-4" />
                            </span>
                            <div>
                              <p className="font-medium text-gray-900">{vm.planName}</p>
                              <p className="text-xs text-gray-500">
                                {vm.billing}
                                {vm.quantity > 1 ? ` · ×${vm.quantity}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <CategoryBadge category={vm.category} />
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={vm.status} />
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-gray-600">
                          {formatInr(vm.pricingSnapshot.total)}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500">
                          {formatDateTime(vm.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Quick actions</h2>
            </div>
            <div className="grid gap-px bg-gray-100 sm:grid-cols-2">
              <Link
                href={routes.create}
                className="flex items-start gap-3 bg-white px-6 py-5 transition hover:bg-gray-50"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                  <Plus className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Create a VM</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Pick a plan, billing cycle, and template from the live catalog.
                  </p>
                </div>
              </Link>
              <Link
                href={routes.myVms}
                className="flex items-start gap-3 bg-white px-6 py-5 transition hover:bg-gray-50"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                  <Server className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">View my VMs</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {stats.total > 0
                      ? `${stats.total} catalog VM${stats.total === 1 ? '' : 's'} on your account.`
                      : 'Track requests and VMs associated with your account.'}
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
