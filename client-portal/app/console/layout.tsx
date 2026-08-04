'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { ConsoleProvider, useConsoleShell } from '../../components/console/ConsoleContext';
import { ConsoleSidebar } from '../../components/console/ConsoleSidebar';
import { ConsoleTopBar } from '../../components/console/ConsoleTopBar';
import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';
import { AdminServicesProvider } from '../../context/AdminServicesContext';

function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useConsoleShell();

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={<ConsoleSidebar />}
      topBar={<ConsoleTopBar />}
    >
      {children}
    </ServiceShellLayout>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isTenantArea =
    pathname === '/console/login' ||
    pathname === '/console/forgot-password' ||
    pathname === '/console/reset-password' ||
    (pathname?.startsWith('/console/dashboard') ?? false);

  const usesOwnShell =
    (pathname?.startsWith('/console/elastic-servers') ?? false) ||
    (pathname?.startsWith('/console/azure') ?? false) ||
    (pathname?.startsWith('/console/cloud-labs/azure') ?? false) ||
    (pathname?.startsWith('/console/machine-manager') ?? false) ||
    (pathname?.startsWith('/console/aws') ?? false) ||
    (pathname?.startsWith('/console/docs') ?? false) ||
    (pathname?.startsWith('/console/create-vm') ?? false) ||
    (pathname?.startsWith('/console/dedicated-server') ?? false) ||
    (pathname?.startsWith('/console/projects') ?? false);

  useEffect(() => {
    if (isTenantArea) return;
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (user.accountType === 'b2c' && user.onboardingStatus === 'kyc_pending') {
      router.replace('/onboarding/individual-kyc');
      return;
    }
    if (
      user.accountType === 'b2b' &&
      ['org_details_pending', 'org_review_pending', 'org_rejected'].includes(user.onboardingStatus)
    ) {
      router.replace('/onboarding/organization');
      return;
    }

    const isAzureConsolePath =
      (pathname?.startsWith('/console/azure') ?? false) ||
      (pathname?.startsWith('/console/cloud-labs') ?? false);
    const roleAllowed =
      user.role === 'admin' ||
      (user.role === 'super_admin' && isAzureConsolePath);

    if (!roleAllowed) {
      router.replace(
        user.role === 'super_admin' ? '/super-admin-console' : '/dashboard/user'
      );
    }
  }, [isLoading, isAuthenticated, user, router, pathname, isTenantArea]);

  // Tenant workspace (login + dashboard) — no platform console shell.
  if (isTenantArea) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  const isAzureConsolePath =
    (pathname?.startsWith('/console/azure') ?? false) ||
    (pathname?.startsWith('/console/cloud-labs') ?? false);
  const roleAllowed =
    Boolean(user) &&
    (user!.role === 'admin' ||
      (user!.role === 'super_admin' && isAzureConsolePath));

  if (!isAuthenticated || !user || !roleAllowed) return null;

  return (
    <AdminServicesProvider>
      {usesOwnShell ? (
        children
      ) : (
        <ConsoleProvider>
          <ConsoleShell>{children}</ConsoleShell>
        </ConsoleProvider>
      )}
    </AdminServicesProvider>
  );
}
