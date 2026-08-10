'use client';

import Link from 'next/link';
import { LayoutGrid, Loader2, Server, Wallet } from 'lucide-react';
import { RecentResourcesTable } from '@/components/console/RecentResourcesTable';
import { useAdminServices } from '@/context/AdminServicesContext';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_SERVICE_KEYS } from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import { PROJECT_SERVICE_LABELS } from '@/lib/projectsApi';

export default function OrgAdminOverviewPage() {
  const { user } = useAuth();
  const { services, loading, hasActiveService } = useAdminServices();

  const activeKeys = ADMIN_SERVICE_KEYS.filter(
    (key) => !isServiceHiddenFromUi(key) && hasActiveService(key) && key !== 'docs'
  );
  const activeCount = activeKeys.length;
  const suspendedCount = services.filter(
    (s) => s.status === 'suspended' && !isServiceHiddenFromUi(s.serviceKey)
  ).length;

  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          {user?.email ? `Signed in as ${user.email}` : 'Organization console summary'}
        </p>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Active services
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">{activeCount}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Suspended
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">{suspendedCount}</p>
                </div>
              </div>
            </div>
            <Link
              href="/dashboard/admin/billing"
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#B91C1C]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Billing
                  </p>
                  <p className="text-sm font-semibold text-gray-900">Open wallet →</p>
                </div>
              </div>
            </Link>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-900">Enabled services</h2>
              <Link href="/console" className="text-xs font-medium text-[#B91C1C] hover:underline">
                View all services
              </Link>
            </div>
            {activeKeys.length === 0 ? (
              <p className="text-sm text-gray-500">
                No product services are enabled yet. Ask a Super Admin to assign services.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {activeKeys.map((key) => (
                  <li
                    key={key}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
                  >
                    {PROJECT_SERVICE_LABELS[key] || key}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <RecentResourcesTable />
        </>
      )}
    </div>
  );
}
