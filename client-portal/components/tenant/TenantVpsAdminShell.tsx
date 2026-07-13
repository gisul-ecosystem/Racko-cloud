'use client';

import { ServiceShellLayout } from '@/components/console/ServiceShellLayout';
import { useServiceShell } from '@/components/console/useServiceShell';
import { TenantTopBar } from '@/components/tenant/TenantTopBar';
import { TenantVpsAdminSidebar } from '@/components/tenant/TenantVpsAdminSidebar';

export function TenantVpsAdminShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <TenantVpsAdminSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <TenantTopBar
          onToggleSidebar={toggleSidebar}
          title="VPS Hosting"
          subtitle="Virtual machines & jobs"
        />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}
