'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TenantServicesProvider } from '@/context/TenantServicesContext';
import { TenantConsoleShell } from '@/components/tenant/TenantConsoleShell';

function TenantConsoleAuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();
  const pathname = usePathname() ?? '';

  const usesOwnShell =
    pathname.startsWith('/tenant/console/elastic-servers') ||
    pathname.startsWith('/tenant/console/azure') ||
    pathname.startsWith('/tenant/console/aws') ||
    pathname.startsWith('/tenant/console/gcp') ||
    pathname.startsWith('/tenant/console/machine-manager') ||
    pathname.startsWith('/tenant/console/docs');

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

  if (usesOwnShell) {
    return <>{children}</>;
  }

  return <TenantConsoleShell>{children}</TenantConsoleShell>;
}

export default function TenantConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantServicesProvider>
      <TenantConsoleAuthGate>{children}</TenantConsoleAuthGate>
    </TenantServicesProvider>
  );
}
