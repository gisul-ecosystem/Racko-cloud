'use client';

import { useServiceShell } from '../../../components/console/useServiceShell';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { SuperAdminAzureSidebar } from '../../../components/super-admin-console/SuperAdminAzureSidebar';
import { SuperAdminConsoleTopBar } from '../../../components/super-admin-console/SuperAdminConsoleTopBar';

export default function SuperAdminAzureLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <SuperAdminAzureSidebar
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
