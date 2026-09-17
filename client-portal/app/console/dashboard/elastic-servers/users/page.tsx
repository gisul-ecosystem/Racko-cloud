'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TenantElasticUsersPage } from '@/components/tenant/TenantElasticUsersPage';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';

export default function TenantElasticUsersRoute() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();
  const { isConsoleStaff, hasPermission } = useTenantRbac();

  const canManageUsers =
    tenantUser?.role === 'tenant_admin' ||
    (isConsoleStaff && hasPermission('users.manage'));

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace(tenantVps.vms);
      return;
    }
    if (tenantUser && !canManageUsers) {
      router.replace(tenantConsole.elastic);
    }
  }, [router, tenantUser, canManageUsers]);

  if (!canManageUsers) return null;

  return <TenantElasticUsersPage />;
}
