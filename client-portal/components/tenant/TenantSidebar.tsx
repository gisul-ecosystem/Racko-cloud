'use client';

import { usePathname } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { ServiceNavSidebar, type ServiceNavLink } from '@/components/console/ServiceNavSidebar';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';

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
  const { accentColor } = useTenantBranding();

  const links: ServiceNavLink[] = [
    {
      href: TENANT_CONSOLE,
      label: 'All services',
      icon: <LayoutGrid className="h-4 w-4" />,
      exact: true,
    },
  ];

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      title="Tenant portal"
      subtitle={pathname.includes('plans') ? 'VM plans' : 'Account'}
      links={links}
      accentColor={accentColor}
      footerHref={TENANT_CONSOLE}
      footerLabel="Back to console"
    />
  );
}
