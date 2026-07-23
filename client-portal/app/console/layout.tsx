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

  const usesOwnShell =
    (pathname?.startsWith('/console/elastic-servers') ?? false) ||
    (pathname?.startsWith('/console/azure') ?? false) ||
    (pathname?.startsWith('/console/machine-manager') ?? false) ||
    (pathname?.startsWith('/console/aws') ?? false) ||
    (pathname?.startsWith('/console/docs') ?? false) ||
    (pathname?.startsWith('/console/create-vm') ?? false) ||
    (pathname?.startsWith('/console/dedicated-server') ?? false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }

    const isAzureConsolePath = pathname?.startsWith('/console/azure') ?? false;
    const roleAllowed =
      user.role === 'admin' ||
      (user.role === 'super_admin' && isAzureConsolePath);

    if (!roleAllowed) {
      router.replace(
        user.role === 'super_admin' ? '/super-admin-console' : '/dashboard/user'
      );
    }
  }, [isLoading, isAuthenticated, user, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  const isAzureConsolePath = pathname?.startsWith('/console/azure') ?? false;
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
