'use client';

import { RackoGlobalTopBar } from './RackoGlobalTopBar';
import { ServiceShellLayout } from './ServiceShellLayout';
import { useServiceShell } from './useServiceShell';
import { VpsAdminSidebar } from './VpsAdminSidebar';

export function VpsAdminShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <VpsAdminSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <RackoGlobalTopBar
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
