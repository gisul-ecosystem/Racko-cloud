'use client';

import { LayoutDashboard, Plus, Server } from 'lucide-react';
import { ServiceNavSidebar } from './ServiceNavSidebar';

interface CreateVmCatalogSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

export function CreateVmCatalogSidebar({
  sidebarOpen,
  onCloseSidebar,
}: CreateVmCatalogSidebarProps) {
  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      title="VM Catalog"
      subtitle="Browse plans & manage VMs"
      footerHref="/console"
      footerLabel="All services"
      links={[
        {
          href: '/console/create-vm',
          label: 'Overview',
          icon: <LayoutDashboard className="h-4 w-4" />,
          exact: true,
        },
        {
          href: '/console/create-vm/create',
          label: 'Create VM',
          icon: <Plus className="h-4 w-4" />,
        },
        {
          href: '/console/create-vm/my-vms',
          label: 'My VM',
          icon: <Server className="h-4 w-4" />,
        },
      ]}
    />
  );
}
