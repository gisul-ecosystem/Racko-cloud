'use client';

import { TenantVmListView } from '@/components/tenant/TenantVmListView';
import { TenantUserResourcesTabs } from '@/components/tenant/TenantUserResourcesTabs';
import { useTenantAuth } from '@/context/TenantAuthContext';

export default function TenantAdminVmListPage() {
  const { tenantUser } = useTenantAuth();

  if (tenantUser?.role === 'tenant_user') {
    return <TenantUserResourcesTabs />;
  }

  return <TenantVmListView />;
}
