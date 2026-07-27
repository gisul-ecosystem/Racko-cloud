'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TenantConsoleShell } from '@/components/tenant/TenantConsoleShell';

function TenantConsoleAuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  // Guards against firing router.replace more than once for the same
  // "confirmed unauthenticated" state (e.g. duplicate effect invocations,
  // or the router identity changing) while still allowing a fresh redirect
  // if the user becomes unauthenticated again later (session expiry).
  const hasRedirectedRef = useRef(false);

  const usesOwnShell =
    pathname.startsWith('/tenant/console/elastic-servers') ||
    pathname.startsWith('/tenant/console/create-vm') ||
    pathname.startsWith('/tenant/console/dedicated-server') ||
    pathname.startsWith('/tenant/console/azure') ||
    pathname.startsWith('/tenant/console/aws') ||
    pathname.startsWith('/tenant/console/gcp') ||
    pathname.startsWith('/tenant/console/machine-manager') ||
    pathname.startsWith('/tenant/console/docs');

  useEffect(() => {
    // isLoading is true until TenantAuthContext has finished checking
    // sessionStorage (e.g. right after a new tab opens and is still
    // rehydrating its cloned session). Never redirect during that window —
    // "still loading" is NOT the same as "confirmed unauthenticated".
    if (isLoading) return;

    if (isAuthenticated) {
      hasRedirectedRef.current = false;
      return;
    }

    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    router.replace('/tenant/login');
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
  return <TenantConsoleAuthGate>{children}</TenantConsoleAuthGate>;
}
