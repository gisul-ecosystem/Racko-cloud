'use client';

import { LayoutGrid, Plus } from 'lucide-react';
import { ServiceNavSidebar } from '../../components/console/ServiceNavSidebar';
import { useAzureShell } from '../../cloud_automation/hooks/useAzureShell';
import { useAzureRoutes } from '../../lib/cloudPortalRoutes';
import { AZURE_LABS_SERVICE, CLOUD_LABS_SERVICE } from '../constants';

export function AzureLabsSidebar() {
  const { sidebarOpen, setSidebarOpen } = useAzureShell();
  const routes = useAzureRoutes();

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={() => setSidebarOpen(false)}
      title={AZURE_LABS_SERVICE.name}
      subtitle={CLOUD_LABS_SERVICE.name}
      links={[
        {
          href: routes.dashboard,
          label: 'Overview',
          icon: <LayoutGrid className="h-4 w-4" />,
          exact: true,
        },
        {
          href: routes.createRequest,
          label: 'Create request',
          icon: <Plus className="h-4 w-4" />,
        },
      ]}
      footerHref={routes.consoleHub}
      footerLabel="Cloud Labs"
    />
  );
}
