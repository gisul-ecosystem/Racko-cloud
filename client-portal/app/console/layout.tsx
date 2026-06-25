'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { ConsoleProvider, useConsoleShell } from '../../components/console/ConsoleContext';
import { ConsoleSidebar } from '../../components/console/ConsoleSidebar';
import { ConsoleTopBar } from '../../components/console/ConsoleTopBar';
import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';

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
    (pathname?.startsWith('/console/aws') ?? false) ||
    (pathname?.startsWith('/console/docs') ?? false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace(
        user.role === 'super_admin' ? '/super-admin-console' : '/dashboard/user'
      );
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user || user.role !== 'admin') return null;

  if (usesOwnShell) {
    return <>{children}</>;
  }

  return (
    <ConsoleProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </ConsoleProvider>
  );
}
