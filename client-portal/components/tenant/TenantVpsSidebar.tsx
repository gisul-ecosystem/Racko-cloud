'use client';

import {
  Briefcase,
  LayoutDashboard,
  Plus,
  Server,
  UserCheck,
  Users,
} from 'lucide-react';
import { ServiceNavSidebar, type ServiceNavLink } from '@/components/console/ServiceNavSidebar';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';

interface TenantVpsSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

/** Same structure/labels as admin VpsAdminSidebar, tenant routes + branding accent. */
export function TenantVpsSidebar({ sidebarOpen, onCloseSidebar }: TenantVpsSidebarProps) {
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const isAdmin = tenantUser?.role === 'tenant_admin';

  const links: ServiceNavLink[] = [
    {
      href: '/console/dashboard/overview',
      label: 'Overview',
      icon: <LayoutDashboard className="h-4 w-4" />,
      exact: true,
    },
    {
      href: '/console/dashboard/vms',
      label: 'My VMs',
      icon: <Server className="h-4 w-4" />,
      isActive: (p) =>
        p === '/console/dashboard/vms' ||
        (p.startsWith('/console/dashboard/vms/') &&
          !p.startsWith('/console/dashboard/vms/onboard')),
    },
  ];

  if (isAdmin) {
    links.push(
      {
        href: '/console/dashboard/orders/new',
        label: 'Create VM',
        icon: <Plus className="h-4 w-4" />,
        exact: true,
      },
      {
        href: '/console/dashboard/orders',
        label: 'Jobs',
        icon: <Briefcase className="h-4 w-4" />,
        isActive: (p) =>
          p === '/console/dashboard/orders' ||
          (p.startsWith('/console/dashboard/orders/') &&
            !p.startsWith('/console/dashboard/orders/new')),
      },
      {
        href: '/console/dashboard/users',
        label: 'Users',
        icon: <Users className="h-4 w-4" />,
      },
      {
        href: '/console/dashboard/vms/onboard',
        label: 'Assign VMs',
        icon: <UserCheck className="h-4 w-4" />,
        exact: true,
      },
      {
        href: '/console/dashboard/vms/onboard',
        label: 'Bulk Assign',
        icon: <Users className="h-4 w-4" />,
        exact: true,
      }
    );
  }

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      title="VPS Hosting"
      subtitle="Virtual machines & jobs"
      links={links}
      accentColor={accentColor}
      footerHref="/console/dashboard/services"
      footerLabel="All services"
    />
  );
}
