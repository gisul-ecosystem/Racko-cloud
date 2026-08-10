'use client';

import { TenantDocsSidebar } from '@/components/tenant/TenantDocsSidebar';
import { TenantTopBar } from '@/components/tenant/TenantTopBar';
import { ServiceShellLayout } from '@/components/console/ServiceShellLayout';
import { useServiceShell } from '@/components/console/useServiceShell';

function DocsShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <TenantDocsSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <TenantTopBar
          onToggleSidebar={toggleSidebar}
          title="Documentation"
          subtitle="Guides for your enabled services"
        />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}

/** Docs is always allowed; topics filter to active product services. */
export default function TenantDocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
