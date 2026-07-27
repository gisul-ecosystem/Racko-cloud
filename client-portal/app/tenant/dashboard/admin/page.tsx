'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { VpsOverviewDashboard } from '@/components/dashboard/VpsOverviewDashboard';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { ApiError } from '@/lib/apiClient';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { tenantVps } from '@/lib/tenantAdminRoutes';
import { fetchTenantVms } from '@/lib/tenantVmApi';
import type { TenantVmSummary } from '@/types/tenantPortal';

export default function TenantAdminOverviewPage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const isAdmin = tenantUser?.role === 'tenant_admin';

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace(tenantVps.vms);
    }
  }, [router, tenantUser?.role]);

  const [vms, setVms] = useState<TenantVmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTenantVms();
      setVms(result.vms);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (tenantUser?.role === 'tenant_user') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div
          className="h-7 w-7 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: accentColor, borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (error && !loading) {
    return <ErrorState title="Overview unavailable" message={error} onRetry={() => void load()} />;
  }

  return (
    <VpsOverviewDashboard
      email={tenantUser?.email ?? ''}
      loading={loading}
      createHref={tenantVps.createVm}
      vmsListHref={tenantVps.vms}
      vmDetailHrefPrefix={tenantVps.vms}
      showCreateButton={isAdmin}
      createButtonClassName="text-white hover:opacity-90"
      createButtonStyle={tenantAccentButton(accentColor)}
      vms={vms.map((vm) => ({
        id: vm.id,
        name: vm.name,
        vmid: vm.vmid,
        status: vm.status,
        node: vm.node,
        allocatedCpu: vm.allocatedCpu,
        allocatedMemoryGb: vm.allocatedMemoryGb,
        allocatedDiskGb: vm.allocatedDiskGb,
        createdAt: vm.createdAt,
      }))}
    />
  );
}
