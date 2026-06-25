'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useServiceShell } from '../../components/console/useServiceShell';
import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';
import { SuperAdminConsoleSidebar } from '../../components/super-admin-console/SuperAdminConsoleSidebar';
import { SuperAdminConsoleTopBar } from '../../components/super-admin-console/SuperAdminConsoleTopBar';

const SERVICES_WITH_OWN_SHELL = [
  '/super-admin-console/vm-management',
  '/super-admin-console/azure',
  '/super-admin-console/machine-manager',
];

function SuperAdminConsoleShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(false);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <SuperAdminConsoleSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={<SuperAdminConsoleTopBar onToggleSidebar={toggleSidebar} />}
    >
      {children}
    </ServiceShellLayout>
  );
}

export default function SuperAdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const usesOwnShell = SERVICES_WITH_OWN_SHELL.some((p) => pathname?.startsWith(p) ?? false);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && user && user.role !== 'super_admin') {
      router.replace(user.role === 'admin' ? '/console' : '/dashboard/user');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user || user.role !== 'super_admin') return null;

  // Sub-services render their own shell (sidebar + topbar)
  if (usesOwnShell) return <>{children}</>;

  return <SuperAdminConsoleShell>{children}</SuperAdminConsoleShell>;
}
