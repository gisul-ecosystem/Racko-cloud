'use client';

import { LayoutGrid, Plus } from 'lucide-react';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';
import { tenantConsole } from '@/lib/tenantAdminRoutes';

const links: ServiceNavLink[] = [
  {
    href: tenantConsole.gcp,
    label: 'Overview',
    icon: <LayoutGrid className="h-4 w-4" />,
    exact: true,
  },
  {
    href: `${tenantConsole.gcp}/requests/new`,
    label: 'Create request',
    icon: <Plus className="h-4 w-4" />,
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
