'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { getTenantDefaultDashboardPath } from '@/lib/tenantPortalRoutes';

export default function TenantDashboardIndexPage() {
  const router = useRouter();
  const { isLoading, tenantUser } = useTenantAuth();

  useEffect(() => {
    if (isLoading) return;
    router.replace(getTenantDefaultDashboardPath(tenantUser?.role));
  }, [isLoading, router, tenantUser?.role]);

  return null;
}
