'use client';

import { HardDrive, LayoutGrid, Server } from 'lucide-react';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { DedicatedServerPortalProvider } from '@/context/DedicatedServerPortalContext';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { tenantDedicatedServerPortalConfig } from '@/lib/dedicatedServerPortalConfig';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';

const links: ServiceNavLink[] = [
  {
    href: tenantConsole.dedicatedServer,
    label: 'Overview',
    icon: <LayoutGrid className="h-4 w-4" />,
    exact: true,
  },
  {
    href: tenantConsole.dedicatedServerRequest,
    label: 'Request Server',
    icon: <HardDrive className="h-4 w-4" />,
  },
  {
    href: tenantConsole.dedicatedServerMyServers,
    label: 'My Servers',
    icon: <Server className="h-4 w-4" />,
  },
];

export default function TenantDedicatedServerLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useTenantAuth();

  return (
    <RequireTenantService serviceKey="dedicated-server">
      <DedicatedServerPortalProvider
        config={tenantDedicatedServerPortalConfig}
        isReady={!isLoading && isAuthenticated}
      >
        <TenantServiceShell
          title="Dedicated Server"
          subtitle="Request & manage dedicated servers"
          links={links}
        >
          {children}
        </TenantServiceShell>
      </DedicatedServerPortalProvider>
    </RequireTenantService>
  );
}
