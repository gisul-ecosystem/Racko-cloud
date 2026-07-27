'use client';

import { useServiceShell } from '../../../components/console/useServiceShell';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { VmManagementSidebar } from '../../../components/super-admin-console/VmManagementSidebar';
import { SuperAdminConsoleTopBar } from '../../../components/super-admin-console/SuperAdminConsoleTopBar';

export default function VmManagementLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <VmManagementSidebar
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
