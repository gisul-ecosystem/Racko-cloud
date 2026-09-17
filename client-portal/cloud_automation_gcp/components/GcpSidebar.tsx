'use client';

import { LayoutGrid, Plus } from 'lucide-react';
import { ServiceNavSidebar } from '../../components/console/ServiceNavSidebar';
import { useGcpShell } from '../hooks/useGcpShell';
import { useGcpRoutes } from '../../lib/cloudPortalRoutes';

export function GcpSidebar() {
  const { sidebarOpen, setSidebarOpen } = useGcpShell();
  const GCP_ROUTES = useGcpRoutes();

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={() => setSidebarOpen(false)}
      title="GCP Services"
      subtitle="Cloud automation"
      links={[
        {
          href: GCP_ROUTES.dashboard,
          label: 'Overview',
          icon: <LayoutGrid className="h-4 w-4" />,
          exact: true,
        },
        {
          href: GCP_ROUTES.createRequest,
          label: 'Create request',
          icon: <Plus className="h-4 w-4" />,
        },
      ]}
      footerHref={GCP_ROUTES.consoleHub}
      footerLabel="All services"
    />
  );
}
