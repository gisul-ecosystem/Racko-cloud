'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TenantUsersPage } from '@/components/tenant/TenantUsersPage';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';

export default function TenantAdminUsersPage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace(TENANT_CONSOLE);
    }
  }, [router, tenantUser?.role]);

  if (tenantUser?.role !== 'tenant_admin') return null;

  return <TenantUsersPage />;
}
