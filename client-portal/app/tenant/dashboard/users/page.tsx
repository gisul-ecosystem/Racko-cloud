'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TenantUsersPage } from '@/components/tenant/TenantUsersPage';
import { useTenantAuth } from '@/context/TenantAuthContext';

export default function TenantUsersRoutePage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/dashboard/my-vms');
    }
  }, [router, tenantUser?.role]);

  if (tenantUser?.role !== 'tenant_admin') return null;

  return <TenantUsersPage />;
}
