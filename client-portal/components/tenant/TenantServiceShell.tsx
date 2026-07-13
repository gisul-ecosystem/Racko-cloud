'use client';

import type { CSSProperties } from 'react';
import { ServiceShellLayout } from '@/components/console/ServiceShellLayout';
import { useServiceShell } from '@/components/console/useServiceShell';
import { ServiceNavSidebar, type ServiceNavLink } from '@/components/console/ServiceNavSidebar';
import { TenantTopBar } from '@/components/tenant/TenantTopBar';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { hexToRgba } from '@/lib/tenantAccentStyles';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';

interface TenantServiceShellProps {
  title: string;
  subtitle: string;
  links: ServiceNavLink[];
  children: React.ReactNode;
}

/** Generic branded service shell (Elastic, Azure, etc.) with All services footer. */
export function TenantServiceShell({
  title,
  subtitle,
  links,
  children,
}: TenantServiceShellProps) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);
  const { accentColor } = useTenantBranding();

  const brandStyle = {
    ['--cloud-accent' as string]: accentColor,
    ['--cloud-accent-soft' as string]: hexToRgba(accentColor, 0.1),
  } as CSSProperties;

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      style={brandStyle}
      sidebar={
        <ServiceNavSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
          title={title}
          subtitle={subtitle}
          links={links}
          accentColor={accentColor}
          footerHref={TENANT_CONSOLE}
          footerLabel="All services"
        />
      }
      topBar={
        <TenantTopBar onToggleSidebar={toggleSidebar} title={title} subtitle={subtitle} />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}
