'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ConsoleProvider, useConsoleShell } from '../../components/console/ConsoleContext';
import { ConsoleSidebar } from '../../components/console/ConsoleSidebar';
import { ConsoleTopBar } from '../../components/console/ConsoleTopBar';

function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useConsoleShell();

  return (
    <div className="min-h-screen bg-gray-50">
      <ConsoleSidebar />

      <div
        className={`min-h-screen transition-all duration-300 ${
          sidebarOpen ? 'lg:ml-60' : 'lg:ml-0'
        }`}
      >
        <ConsoleTopBar />
        <main className="p-6 lg:p-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Elastic Servers has its own full sidebar layout — bypass the console shell
  // (ConsoleSidebar + ConsoleTopBar) for those routes. Auth is still enforced
  // here and re-checked in the nested elastic-servers layout.
  const isElastic = pathname?.startsWith('/console/elastic-servers') ?? false;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace(
        user.role === 'super_admin' ? '/dashboard/super-admin' : '/dashboard/user'
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

  if (isElastic) {
    return <>{children}</>;
  }

  return (
    <ConsoleProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </ConsoleProvider>
  );
}
