'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TenantVmDetailView } from '@/components/tenant/TenantVmViews';
import { useTenantAuth } from '@/context/TenantAuthContext';

export default function TenantUserVmDetailPage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();

  useEffect(() => {
    if (tenantUser?.role === 'tenant_admin') {
      router.replace('/tenant/dashboard/vms');
    }
  }, [router, tenantUser?.role]);

  if (tenantUser?.role !== 'tenant_user') return null;

  return <TenantVmDetailView scope="user" />;
}
