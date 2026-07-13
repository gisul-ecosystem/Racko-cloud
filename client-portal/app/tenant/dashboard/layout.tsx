'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TenantServicesProvider } from '@/context/TenantServicesContext';
import { TenantShell } from '@/components/tenant/TenantShell';

export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const isAdminMirror = pathname.startsWith('/tenant/dashboard/admin');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/tenant/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: accentColor, borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <TenantServicesProvider>
      {isAdminMirror ? children : <TenantShell>{children}</TenantShell>}
    </TenantServicesProvider>
  );
}
