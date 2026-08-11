'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Globe,
  History,
  Loader2,
  PieChart,
  Plus,
  RefreshCw,
  UserCog,
  Users,
  Zap,
} from 'lucide-react';
import { ApiError } from '../../../lib/apiClient';
import { fetchSuperAdminOverview, fetchTenants } from '../../../lib/tenantApi';
import type { SuperAdminOverview, Tenant } from '../../../lib/tenantTypes';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { OverviewStatCard } from '../../../components/super-admin-console/white-labelling/OverviewStatCard';
import { TenantStatusBadge } from '../../../components/super-admin-console/white-labelling/TenantStatusBadge';
import { WhiteLabellingEmptyState } from '../../../components/super-admin-console/white-labelling/WhiteLabellingEmptyState';

export default function WhiteLabellingOverviewPage() {
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null);
  const [recentTenants, setRecentTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, tenantsData] = await Promise.all([
        fetchSuperAdminOverview(),
        fetchTenants({ page: 1, limit: 5 }),
      ]);
      setOverview(overviewData);
      setRecentTenants(tenantsData.tenants);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !overview) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error && !overview) {
    return <ErrorState title="Failed to load overview" message={error} onRetry={load} />;
  }

  if (!overview) return null;

  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">White Labelling Overview</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Cross-tenant stats and platform health
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <OverviewStatCard
          label="Total tenants"
          value={overview.totalTenants}
          icon={Building2}
          accent="red"
        />
        <OverviewStatCard
          label="Active tenants"
          value={overview.tenantsByStatus.active}
          icon={CheckCircle2}
          accent="green"
        />
        <OverviewStatCard
          label="Pending tenants"
          value={overview.tenantsByStatus.pending}
          icon={Clock}
          accent="amber"
        />
        <OverviewStatCard
          label="Tenant admins"
          value={overview.totalTenantAdmins}
          icon={UserCog}
          accent="blue"
        />
        <OverviewStatCard
          label="Managed users"
          value={overview.managedUsers}
          icon={Users}
          accent="purple"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-[#B91C1C]" />
            <h2 className="text-sm font-semibold text-gray-900">Tenants by status</h2>
          </div>
          <div className="space-y-3">
            {(['active', 'pending', 'suspended', 'cancelled'] as const).map((status) => (
              <div key={status} className="flex items-center justify-between">
                <TenantStatusBadge status={status} />
                <span className="text-sm font-medium text-gray-900">
                  {overview.tenantsByStatus[status]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#B91C1C]" />
            <h2 className="text-sm font-semibold text-gray-900">Quick actions</h2>
          </div>
          <div className="space-y-2">
            <Link
              href="/super-admin-console/white-labelling/tenants"
              className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-sm text-gray-700 transition hover:border-[#B91C1C] hover:bg-red-50"
            >
              <span className="flex items-center gap-2.5">
                <Building2 className="h-4 w-4 text-gray-400" />
                Manage all tenants
              </span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </Link>
            <Link
              href="/super-admin-console/white-labelling/tenants?create=true"
              className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-sm text-gray-700 transition hover:border-[#B91C1C] hover:bg-red-50"
            >
              <span className="flex items-center gap-2.5">
                <Plus className="h-4 w-4 text-gray-400" />
                Create new tenant
              </span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </Link>
            <Link
              href="/super-admin-console/white-labelling/orders"
              className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-sm text-gray-700 transition hover:border-[#B91C1C] hover:bg-red-50"
            >
              <span className="flex items-center gap-2.5">
                <History className="h-4 w-4 text-gray-400" />
                Review tenant orders
              </span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-[#B91C1C]" />
            <h2 className="text-sm font-semibold text-gray-900">Recent tenants</h2>
          </div>
          <Link
            href="/super-admin-console/white-labelling/tenants"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#B91C1C] hover:underline"
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {recentTenants.length === 0 ? (
          <WhiteLabellingEmptyState
            icon={Building2}
            title="No tenants yet"
            description="Create your first white-label tenant to get started."
            action={
              <Link
                href="/super-admin-console/white-labelling/tenants?create=true"
                className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
              >
                <Plus className="h-4 w-4" />
                Create tenant
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {recentTenants.map((tenant) => (
              <Link
                key={tenant.id}
                href={`/super-admin-console/white-labelling/tenants/${tenant.id}`}
                className="flex items-center justify-between px-5 py-3.5 transition hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                    <Building2 className="h-4 w-4 text-[#B91C1C]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tenant.name}</p>
                    <p className="text-xs text-gray-500">{tenant.domain}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <TenantStatusBadge status={tenant.status} />
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
