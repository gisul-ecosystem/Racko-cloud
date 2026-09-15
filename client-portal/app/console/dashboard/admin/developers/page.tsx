'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ApiCredentialsPage } from '@/components/developers/ApiCredentialsPage';
import { tenantApiCredentialsClient } from '@/lib/apiCredentialsApi';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';

export default function TenantApiCredentialsPage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace(TENANT_CONSOLE);
    }
  }, [router, tenantUser?.role]);

  if (tenantUser?.role !== 'tenant_admin') {
    return null;
  }

  return (
    <ApiCredentialsPage client={tenantApiCredentialsClient} accentColor={accentColor} />
  );
}
