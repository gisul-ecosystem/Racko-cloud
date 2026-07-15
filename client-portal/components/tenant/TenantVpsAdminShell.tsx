'use client';

import { ServiceShellLayout } from '@/components/console/ServiceShellLayout';
import { useServiceShell } from '@/components/console/useServiceShell';
import { TenantTopBar } from '@/components/tenant/TenantTopBar';
import { TenantVpsAdminSidebar } from '@/components/tenant/TenantVpsAdminSidebar';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';

export function TenantVpsAdminShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);
  const { tenantUser } = useTenantAuth();
  const { portalName } = useTenantBranding();
  const isEndUser = tenantUser?.role === 'tenant_user';

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
          title={isEndUser ? 'My VMs' : 'VPS Hosting'}
          subtitle={isEndUser ? `${portalName} workspace` : 'Virtual machines & jobs'}
        />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}
