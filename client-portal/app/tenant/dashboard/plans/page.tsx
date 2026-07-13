'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Server } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { PlanStatusBadge } from '@/components/tenant/PlanStatusBadge';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { listTenantPlans } from '@/lib/tenantPortalApi';
import {
  formatBillingPeriod,
  formatPlanPeriodEnd,
  getPlanDisplayStatus,
  planExpiryLabel,
} from '@/lib/tenantPlanUtils';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { ApiError } from '@/lib/apiClient';
import type { TenantPlan } from '@/types/tenantPortal';

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function rowHighlightClass(plan: TenantPlan): string {
  const status = getPlanDisplayStatus(plan);
  if (status === 'expired') return 'bg-red-50/50';
  if (status === 'expiring_soon') return 'bg-amber-50/50';
  return '';
}

export default function TenantPlansPage() {
  const { tenantUser } = useTenantAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<TenantPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/console');
    }
  }, [tenantUser, router]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTenantPlans();
      setPlans(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VM plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantUser?.role === 'tenant_admin') void load();
  }, [tenantUser]);

  if (tenantUser?.role !== 'tenant_admin') return null;

  if (loading) return <TableSkeleton rows={5} cols={7} />;

  if (error) {
    return <ErrorState title="VM plans unavailable" message={error} onRetry={() => void load()} />;
  }

  return <TenantPlansPageContent plans={plans} />;
}

function TenantPlansPageContent({ plans }: { plans: TenantPlan[] }) {
  const { accentColor } = useTenantBranding();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">VM plans</h1>
        <p className="text-sm text-gray-500">
          Manage billing periods for your provisioned VMs. Extend active plans or renew expired ones.
        </p>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
          <Server className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No VM plans yet.</p>
          <Link
            href="/tenant/dashboard/admin/vms/create"
            className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            style={tenantAccentButton(accentColor)}
          >
            Place an order
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">VM</th>
                  <th className="px-4 py-3">Specs</th>
                  <th className="px-4 py-3">Period end</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Renewal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr
                    key={plan.vmId}
                    className={`border-b border-gray-50 align-top ${rowHighlightClass(plan)}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/tenant/dashboard/plans/${plan.vmId}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {plan.name}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {plan.vmid} · {plan.node}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">Power: {plan.status}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {plan.specs.cpuCores} vCPU · {plan.specs.memoryGb} GB RAM ·{' '}
                      {plan.specs.diskGb} GB disk
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{formatPlanPeriodEnd(plan.planPeriodEnd)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{planExpiryLabel(plan)}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatBillingPeriod(plan.billingPeriod)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {formatMoney(plan.renewalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <PlanStatusBadge plan={plan} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/tenant/dashboard/plans/${plan.vmId}`}
                        className="inline-flex rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {plan.canExtend ? 'Extend' : plan.canRenew ? 'Renew' : 'View'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
