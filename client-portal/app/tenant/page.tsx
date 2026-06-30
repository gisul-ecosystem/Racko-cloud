'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { getTenantDefaultDashboardPath } from '@/lib/tenantPortalRoutes';

export default function TenantRootPage() {
  const { isAuthenticated, isLoading, tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(
      isAuthenticated ? getTenantDefaultDashboardPath(tenantUser?.role) : '/tenant/login'
    );
  }, [isLoading, isAuthenticated, router, tenantUser?.role]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: accentColor, borderTopColor: 'transparent' }}
      />
    </div>
  );
}
