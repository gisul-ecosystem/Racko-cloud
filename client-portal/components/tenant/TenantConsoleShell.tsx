'use client';

import { ServiceShellLayout } from '@/components/console/ServiceShellLayout';
import { useServiceShell } from '@/components/console/useServiceShell';
import { TenantConsoleSidebar } from '@/components/tenant/TenantConsoleSidebar';
import { TenantTopBar } from '@/components/tenant/TenantTopBar';

export function TenantConsoleShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <TenantConsoleSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <TenantTopBar
          onToggleSidebar={toggleSidebar}
          title="Services console"
          subtitle="All enabled services"
        />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}
