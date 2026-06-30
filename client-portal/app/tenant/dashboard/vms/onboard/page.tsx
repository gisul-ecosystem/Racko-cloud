'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TenantOnboardPage } from '@/components/tenant/TenantOnboardPage';
import { useTenantAuth } from '@/context/TenantAuthContext';

export default function TenantOnboardRoutePage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/dashboard/vms');
    }
  }, [router, tenantUser?.role]);

  if (tenantUser?.role !== 'tenant_admin') return null;

  return <TenantOnboardPage />;
}
