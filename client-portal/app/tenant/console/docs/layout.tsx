'use client';

import { RequireTenantService } from '@/components/tenant/RequireTenantService';
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
          subtitle="Guides & reference"
        />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}

export default function TenantDocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireTenantService serviceKey="docs">
      <DocsShell>{children}</DocsShell>
    </RequireTenantService>
  );
}
