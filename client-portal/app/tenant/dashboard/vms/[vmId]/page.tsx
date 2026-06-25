'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TenantVmDetailView } from '@/components/tenant/TenantVmViews';
import { useTenantAuth } from '@/context/TenantAuthContext';

export default function TenantAdminVmDetailPage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/dashboard/my-vms');
    }
  }, [router, tenantUser?.role]);

  if (tenantUser?.role !== 'tenant_admin') return null;

  return <TenantVmDetailView scope="admin" />;
}
