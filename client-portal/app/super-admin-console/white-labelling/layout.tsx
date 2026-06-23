'use client';

import { useServiceShell } from '../../../components/console/useServiceShell';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { SuperAdminConsoleTopBar } from '../../../components/super-admin-console/SuperAdminConsoleTopBar';
import { WhiteLabellingSidebar } from '../../../components/super-admin-console/WhiteLabellingSidebar';

export default function WhiteLabellingLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <WhiteLabellingSidebar
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
