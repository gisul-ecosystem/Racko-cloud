'use client';

import { usePathname } from 'next/navigation';
import { Bell, LayoutGrid, LifeBuoy, Server } from 'lucide-react';
import { ServiceNavSidebar, type ServiceNavLink } from '@/components/console/ServiceNavSidebar';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { TENANT_CONSOLE, tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';

interface TenantSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

/**
 * Lightweight shell nav for leftover dashboard pages (profile, notifications, plans).
 * VPS and console hubs use their own shells — avoids duplicate sidebars.
 */
export function TenantSidebar({ sidebarOpen, onCloseSidebar }: TenantSidebarProps) {
  const pathname = usePathname() ?? '';
  const { accentColor, portalName } = useTenantBranding();
  const { isConsoleStaff } = useTenantRbac();

  const links: ServiceNavLink[] = isConsoleStaff
    ? [
        {
          href: TENANT_CONSOLE,
          label: 'All services',
          icon: <LayoutGrid className="h-4 w-4" />,
          exact: true,
        },
        {
          href: tenantConsole.supportTickets,
          label: 'Support',
          icon: <LifeBuoy className="h-4 w-4" />,
          isActive: (p) => p.startsWith(`${TENANT_CONSOLE}/support`),
        },
        {
          href: tenantConsole.notifications,
          label: 'Notifications',
          icon: <Bell className="h-4 w-4" />,
          exact: true,
        },
      ]
    : [
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
        {
          href: tenantConsole.supportTickets,
          label: 'Support',
          icon: <LifeBuoy className="h-4 w-4" />,
          isActive: (p) => p.startsWith(`${TENANT_CONSOLE}/support`),
        },
      ];

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      title={isConsoleStaff ? 'Tenant portal' : portalName || 'My VMs'}
      subtitle={
        isConsoleStaff
          ? pathname.includes('plans')
            ? 'VM plans'
            : 'Account'
          : 'Assigned resources'
      }
      links={links}
      accentColor={accentColor}
      footerHref={isConsoleStaff ? TENANT_CONSOLE : undefined}
      footerLabel="Back to console"
    />
  );
}
