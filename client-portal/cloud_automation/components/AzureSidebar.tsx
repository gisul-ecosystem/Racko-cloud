'use client';

import { LayoutGrid, Plus } from 'lucide-react';
import { ServiceNavSidebar } from '../../components/console/ServiceNavSidebar';
import { useAzureShell } from '../hooks/useAzureShell';
import { useAzureRoutes } from '../../lib/cloudPortalRoutes';

export function AzureSidebar() {
  const { sidebarOpen, setSidebarOpen } = useAzureShell();
  const AZURE_ROUTES = useAzureRoutes();

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={() => setSidebarOpen(false)}
      title="Azure Services"
      subtitle="Cloud automation"
      links={[
        {
          href: AZURE_ROUTES.dashboard,
          label: 'Overview',
          icon: <LayoutGrid className="h-4 w-4" />,
          exact: true,
        },
        {
          href: AZURE_ROUTES.createRequest,
          label: 'Create request',
          icon: <Plus className="h-4 w-4" />,
        },
      ]}
      footerHref={AZURE_ROUTES.consoleHub}
      footerLabel="All services"
    />
  );
}
