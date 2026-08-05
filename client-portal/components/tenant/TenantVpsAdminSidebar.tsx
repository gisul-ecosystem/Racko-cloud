'use client';

import {
  Briefcase,
  LayoutDashboard,
  Layers,
  Plus,
  Server,
  Shield,
  UserCheck,
  Users,
} from 'lucide-react';
import { ServiceNavSidebar, type ServiceNavLink } from '@/components/console/ServiceNavSidebar';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { TENANT_CONSOLE, tenantVps } from '@/lib/tenantAdminRoutes';

interface TenantVpsAdminSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

/** Mirrors admin VpsAdminSidebar labels/order under /console/dashboard/admin. */
export function TenantVpsAdminSidebar({
  sidebarOpen,
  onCloseSidebar,
}: TenantVpsAdminSidebarProps) {
  const { accentColor, portalName } = useTenantBranding();
  const { isConsoleStaff, hasPermission } = useTenantRbac();
  const canManageVms = hasPermission('vms.manage', 'vms.assign', 'vms.read');
  const showAdminNav = isConsoleStaff && canManageVms;

  const links: ServiceNavLink[] = showAdminNav
    ? [
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
      ]
    : [
        {
          href: tenantVps.vms,
          label: 'My VMs',
          icon: <Server className="h-4 w-4" />,
          exact: true,
        },
      ];

  if (showAdminNav) {
    if (hasPermission('vms.manage', 'orders.create')) {
      links.push({
        href: tenantVps.createVm,
        label: 'Create VM',
        icon: <Plus className="h-4 w-4" />,
        exact: true,
      });
    }
    links.push({
      href: tenantVps.jobs,
      label: 'Jobs',
      icon: <Briefcase className="h-4 w-4" />,
      isActive: (p) => p === tenantVps.jobs || p.startsWith(`${tenantVps.jobs}/`),
    });
    links.push({
      href: tenantVps.templates,
      label: 'My Templates',
      icon: <Layers className="h-4 w-4" />,
    });
    if (hasPermission('users.manage')) {
      links.push({
        href: tenantVps.users,
        label: 'Users',
        icon: <Users className="h-4 w-4" />,
      });
    }
    if (hasPermission('vms.assign')) {
      links.push(
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
        }
      );
    }
    links.push({
      href: tenantVps.restricted,
      label: 'Restricted VMs',
      icon: <Shield className="h-4 w-4" />,
    });
  }

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      title={showAdminNav ? 'VPS Hosting' : portalName || 'My VMs'}
      subtitle={showAdminNav ? 'Virtual machines & jobs' : 'Assigned resources'}
      links={links}
      accentColor={accentColor}
      footerHref={isConsoleStaff ? TENANT_CONSOLE : undefined}
      footerLabel="All services"
    />
  );
}
