'use client';

import { Cloud, LayoutDashboard, Plus, Server } from 'lucide-react';
import { ServiceNavSidebar } from './ServiceNavSidebar';
import { useVmCatalogPortal } from '@/context/VmCatalogPortalContext';

const AZURE_ATTACH_PATH = '/super-admin-console/create-vm/azure';
const AZURE_VMS_PATH = '/super-admin-console/create-vm/azure/vms';

interface SuperAdminCreateVmCatalogSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

export function SuperAdminCreateVmCatalogSidebar({
  sidebarOpen,
  onCloseSidebar,
}: SuperAdminCreateVmCatalogSidebarProps) {
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
      extraSections={[
        {
          heading: 'Azure',
          links: [
            {
              href: AZURE_ATTACH_PATH,
              label: 'Create / Attach VM from Azure',
              icon: <Cloud className="h-4 w-4" />,
              exact: true,
            },
            {
              href: AZURE_VMS_PATH,
              label: 'Azure VMs',
              icon: <Server className="h-4 w-4" />,
            },
          ],
        },
      ]}
    />
  );
}
