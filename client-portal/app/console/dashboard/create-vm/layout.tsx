'use client';

import { LayoutDashboard, Plus, Server } from 'lucide-react';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { VmCatalogPortalProvider } from '@/context/VmCatalogPortalContext';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { tenantVmCatalogPortalConfig } from '@/lib/vmCatalogPortalConfig';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';

const links: ServiceNavLink[] = [
  {
    href: tenantConsole.createVm,
    label: 'Overview',
    icon: <LayoutDashboard className="h-4 w-4" />,
    exact: true,
  },
  {
    href: tenantConsole.createVmCreate,
    label: 'Create VM',
    icon: <Plus className="h-4 w-4" />,
  },
  {
    href: tenantConsole.createVmMyVms,
    label: 'My VM',
    icon: <Server className="h-4 w-4" />,
  },
];

export default function TenantCreateVmLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useTenantAuth();

  return (
    <RequireTenantService serviceKey="create-vm">
      <VmCatalogPortalProvider
        config={tenantVmCatalogPortalConfig}
        isReady={!isLoading && isAuthenticated}
      >
        <TenantServiceShell
          title="VM Catalog"
          subtitle="Browse plans & manage VMs"
          links={links}
        >
          {children}
        </TenantServiceShell>
      </VmCatalogPortalProvider>
    </RequireTenantService>
  );
}
