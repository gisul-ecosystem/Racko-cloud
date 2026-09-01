'use client';

import { useCallback } from 'react';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantMyVmDashboard } from '@/hooks/useTenantMyVmDashboard';
import { MyVmDashboardView } from '@/components/my-vm-dashboard/MyVmDashboardView';
import { tenantCatalogVmPowerAction } from '@/lib/tenantVmCatalogApi';

function TenantMyVmDashboardContent() {
  const { isAuthenticated } = useTenantAuth();
  const { rows, loading, error, refetch } = useTenantMyVmDashboard(isAuthenticated);

  const catalogPowerAction = useCallback(
    async (
      id: string,
      action: Parameters<typeof tenantCatalogVmPowerAction>[1],
      instanceId?: string
    ) => {
      const result = await tenantCatalogVmPowerAction(id, action, instanceId);
      return { action: result.action, panelUrl: result.panelUrl, vm: result.vm };
    },
    []
  );

  return (
    <MyVmDashboardView
      rows={rows}
      loading={loading}
      error={error}
      refetch={refetch}
      catalogPowerAction={catalogPowerAction}
    />
  );
}

export default function TenantMyVmDashboardPage() {
  return <TenantMyVmDashboardContent />;
}
