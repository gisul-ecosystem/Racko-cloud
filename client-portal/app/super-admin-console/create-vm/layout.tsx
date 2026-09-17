'use client';

import { useServiceShell } from '../../../components/console/useServiceShell';
import { SuperAdminCreateVmCatalogSidebar } from '../../../components/console/SuperAdminCreateVmCatalogSidebar';
import { RackoGlobalTopBar } from '../../../components/console/RackoGlobalTopBar';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { VmCatalogPortalProvider } from '../../../context/VmCatalogPortalContext';
import { superAdminVmCatalogPortalConfig } from '../../../lib/vmCatalogPortalConfig';

export default function SuperAdminCreateVmLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <VmCatalogPortalProvider
      config={superAdminVmCatalogPortalConfig}
      isReady={true}
    >
      <ServiceShellLayout
        sidebarOpen={sidebarOpen}
        sidebar={
          <SuperAdminCreateVmCatalogSidebar
            sidebarOpen={sidebarOpen}
            onCloseSidebar={() => setSidebarOpen(false)}
          />
        }
        topBar={
          <RackoGlobalTopBar
            onToggleSidebar={toggleSidebar}
            title="VM Catalog"
            subtitle="Browse plans & manage VMs"
          />
        }
        mainClassName="p-6 lg:p-8"
      >
        {children}
      </ServiceShellLayout>
    </VmCatalogPortalProvider>
  );
}
