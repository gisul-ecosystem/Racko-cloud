'use client';

import { ServiceNavSidebar } from './ServiceNavSidebar';
import { HardDrive, LayoutGrid, Server } from 'lucide-react';
import { useDedicatedServerPortal } from '@/context/DedicatedServerPortalContext';

export function DedicatedServerSidebar({
  sidebarOpen,
  onCloseSidebar,
}: {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}) {
  const { routes } = useDedicatedServerPortal();

  return (
    <ServiceNavSidebar
      title="Dedicated Server"
      subtitle="Request & manage servers"
      footerHref={routes.hub}
      footerLabel="All services"
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      links={[
        {
          href: routes.overview,
          label: 'Overview',
          icon: <LayoutGrid className="h-4 w-4" />,
          exact: true,
        },
        {
          href: routes.request,
          label: 'Request Server',
          icon: <HardDrive className="h-4 w-4" />,
        },
        {
          href: routes.myServers,
          label: 'My Servers',
          icon: <Server className="h-4 w-4" />,
        },
      ]}
    />
  );
}
