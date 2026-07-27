'use client';

import { useServiceShell } from '../../../components/console/useServiceShell';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { SuperAdminAwsSidebar } from '../../../components/super-admin-console/SuperAdminAwsSidebar';
import { SuperAdminConsoleTopBar } from '../../../components/super-admin-console/SuperAdminConsoleTopBar';

export default function SuperAdminAwsLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <SuperAdminAwsSidebar
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
