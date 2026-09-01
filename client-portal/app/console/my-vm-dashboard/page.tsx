'use client';

import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAdminMyVmDashboard } from '@/hooks/useAdminMyVmDashboard';
import { MyVmDashboardView } from '@/components/my-vm-dashboard/MyVmDashboardView';
import { ownedCatalogVmPowerAction } from '@/lib/vmCatalogApi';

export default function MyVmDashboardPage() {
  const { isAuthenticated } = useAuth();
  const { rows, loading, error, refetch } = useAdminMyVmDashboard(isAuthenticated);

  const catalogPowerAction = useCallback(
    async (id: string, action: Parameters<typeof ownedCatalogVmPowerAction>[1], instanceId?: string) => {
      const result = await ownedCatalogVmPowerAction(id, action, instanceId);
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
