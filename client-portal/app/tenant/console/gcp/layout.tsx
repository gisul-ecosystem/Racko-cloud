'use client';

import { LayoutGrid } from 'lucide-react';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';

const links: ServiceNavLink[] = [
  {
    href: tenantConsole.gcp,
    label: 'Overview',
    icon: <LayoutGrid className="h-4 w-4" />,
    exact: true,
  },
];

export default function TenantGcpLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireTenantService serviceKey="gcp">
      <TenantServiceShell title="GCP Services" subtitle="Cloud automation" links={links}>
        {children}
      </TenantServiceShell>
    </RequireTenantService>
  );
}
