'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TenantElasticUsersPage } from '@/components/tenant/TenantElasticUsersPage';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { tenantVps } from '@/lib/tenantAdminRoutes';

export default function TenantElasticUsersRoute() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace(tenantVps.vms);
    }
  }, [router, tenantUser?.role]);

  if (tenantUser?.role !== 'tenant_admin') return null;

  return <TenantElasticUsersPage />;
}
