'use client';

import { LayoutDashboard, Plus, Server } from 'lucide-react';
import { ServiceNavSidebar } from './ServiceNavSidebar';
import { useVmCatalogPortal } from '@/context/VmCatalogPortalContext';

interface CreateVmCatalogSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

export function CreateVmCatalogSidebar({
  sidebarOpen,
  onCloseSidebar,
}: CreateVmCatalogSidebarProps) {
  const { routes } = useVmCatalogPortal();

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      title="VM Catalog"
      subtitle="Browse plans & manage VMs"
      footerHref={routes.hub}
      footerLabel="All services"
      links={[
        {
          href: routes.overview,
          label: 'Overview',
          icon: <LayoutDashboard className="h-4 w-4" />,
          exact: true,
        },
        {
          href: routes.create,
          label: 'Create VM',
          icon: <Plus className="h-4 w-4" />,
        },
        {
          href: routes.myVms,
          label: 'My VM',
          icon: <Server className="h-4 w-4" />,
        },
      ]}
    />
  );
}
