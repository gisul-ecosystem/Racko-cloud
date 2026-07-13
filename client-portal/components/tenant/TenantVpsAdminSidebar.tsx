'use client';

import {
  Briefcase,
  Clock,
  LayoutDashboard,
  Layers,
  Plus,
  Server,
  Shield,
  UserCheck,
  Users,
} from 'lucide-react';
import { ServiceNavSidebar, type ServiceNavLink } from '@/components/console/ServiceNavSidebar';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TENANT_CONSOLE, tenantVps } from '@/lib/tenantAdminRoutes';

interface TenantVpsAdminSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

/** Mirrors admin VpsAdminSidebar labels/order under /tenant/dashboard/admin. */
export function TenantVpsAdminSidebar({
  sidebarOpen,
  onCloseSidebar,
}: TenantVpsAdminSidebarProps) {
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const isAdmin = tenantUser?.role === 'tenant_admin';

  const links: ServiceNavLink[] = [
    {
      href: tenantVps.overview,
      label: 'Overview',
      icon: <LayoutDashboard className="h-4 w-4" />,
      exact: true,
    },
    {
      href: tenantVps.vms,
      label: 'My VMs',
      icon: <Server className="h-4 w-4" />,
      isActive: (p) =>
        p === tenantVps.vms ||
        (p.startsWith(`${tenantVps.vms}/`) &&
          !p.startsWith(tenantVps.restricted) &&
          !p.startsWith(tenantVps.createVm)),
    },
  ];

  if (isAdmin) {
    links.push(
      {
        href: tenantVps.createVm,
        label: 'Create VM',
        icon: <Plus className="h-4 w-4" />,
        exact: true,
      },
      {
        href: tenantVps.jobs,
        label: 'Jobs',
        icon: <Briefcase className="h-4 w-4" />,
        isActive: (p) => p === tenantVps.jobs || p.startsWith(`${tenantVps.jobs}/`),
      },
      {
        href: tenantVps.automation,
        label: 'Automation',
        icon: <Clock className="h-4 w-4" />,
      },
      {
        href: tenantVps.templates,
        label: 'My Templates',
        icon: <Layers className="h-4 w-4" />,
      },
      {
        href: tenantVps.users,
        label: 'Users',
        icon: <Users className="h-4 w-4" />,
      },
      {
        href: tenantVps.assignVms,
        label: 'Assign VMs',
        icon: <UserCheck className="h-4 w-4" />,
        exact: true,
      },
      {
        href: tenantVps.bulkAssign,
        label: 'Bulk Assign',
        icon: <Users className="h-4 w-4" />,
        exact: true,
      },
      {
        href: tenantVps.restricted,
        label: 'Restricted VMs',
        icon: <Shield className="h-4 w-4" />,
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
      footerHref={TENANT_CONSOLE}
      footerLabel="All services"
    />
  );
}
