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
      href: '/tenant/dashboard/overview',
      label: 'Overview',
      icon: <LayoutDashboard className="h-4 w-4" />,
      exact: true,
    },
    {
      href: '/tenant/dashboard/vms',
      label: 'My VMs',
      icon: <Server className="h-4 w-4" />,
      isActive: (p) =>
        p === '/tenant/dashboard/vms' ||
        (p.startsWith('/tenant/dashboard/vms/') &&
          !p.startsWith('/tenant/dashboard/vms/onboard')),
    },
  ];

  if (isAdmin) {
    links.push(
      {
        href: '/tenant/dashboard/orders/new',
        label: 'Create VM',
        icon: <Plus className="h-4 w-4" />,
        exact: true,
      },
      {
        href: '/tenant/dashboard/orders',
        label: 'Jobs',
        icon: <Briefcase className="h-4 w-4" />,
        isActive: (p) =>
          p === '/tenant/dashboard/orders' ||
          (p.startsWith('/tenant/dashboard/orders/') &&
            !p.startsWith('/tenant/dashboard/orders/new')),
      },
      {
        href: '/tenant/dashboard/users',
        label: 'Users',
        icon: <Users className="h-4 w-4" />,
      },
      {
        href: '/tenant/dashboard/vms/onboard',
        label: 'Assign VMs',
        icon: <UserCheck className="h-4 w-4" />,
        exact: true,
      },
      {
        href: '/tenant/dashboard/vms/onboard',
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
      footerHref="/tenant/dashboard/services"
      footerLabel="All services"
    />
  );
}
