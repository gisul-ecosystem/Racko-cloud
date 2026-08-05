'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TenantConsoleShell } from '@/components/tenant/TenantConsoleShell';
import { TenantShell } from '@/components/tenant/TenantShell';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';

export function TenantConsoleAuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const hasRedirectedRef = useRef(false);

  const usesOwnShell =
    pathname.startsWith(`${TENANT_CONSOLE}/elastic-servers`) ||
    pathname.startsWith(`${TENANT_CONSOLE}/create-vm`) ||
    pathname.startsWith(`${TENANT_CONSOLE}/dedicated-server`) ||
    pathname.startsWith(`${TENANT_CONSOLE}/azure`) ||
    pathname.startsWith(`${TENANT_CONSOLE}/aws`) ||
    pathname.startsWith(`${TENANT_CONSOLE}/gcp`) ||
    pathname.startsWith(`${TENANT_CONSOLE}/machine-manager`) ||
    pathname.startsWith(`${TENANT_CONSOLE}/docs`) ||
    pathname.startsWith(`${TENANT_CONSOLE}/projects`);

  const isAdminMirror = pathname.startsWith(`${TENANT_CONSOLE}/admin`);
  const isHubShell =
    pathname === TENANT_CONSOLE ||
    pathname === `${TENANT_CONSOLE}/` ||
    pathname.startsWith(`${TENANT_CONSOLE}/overview`) ||
    pathname.startsWith(`${TENANT_CONSOLE}/access-control`);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      hasRedirectedRef.current = false;
      return;
    }

    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    router.replace('/console/login');
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

  if (usesOwnShell || isAdminMirror) {
    return <>{children}</>;
  }

  if (isHubShell) {
    return <TenantConsoleShell>{children}</TenantConsoleShell>;
  }

  return <TenantShell>{children}</TenantShell>;
}
