'use client';

import { ServiceNavSidebar } from './ServiceNavSidebar';
import { HardDrive, LayoutGrid, Server } from 'lucide-react';

export function DedicatedServerSidebar({
  sidebarOpen,
  onCloseSidebar,
}: {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}) {
  return (
    <ServiceNavSidebar
      title="Dedicated Server"
      subtitle="Request & manage servers"
      footerHref="/console"
      footerLabel="All services"
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      links={[
        {
          href: '/console/dedicated-server',
          label: 'Overview',
          icon: <LayoutGrid className="h-4 w-4" />,
          exact: true,
        },
        {
          href: '/console/dedicated-server/request',
          label: 'Request Server',
          icon: <HardDrive className="h-4 w-4" />,
        },
        {
          href: '/console/dedicated-server/my-servers',
          label: 'My Servers',
          icon: <Server className="h-4 w-4" />,
        },
      ]}
    />
  );
}
