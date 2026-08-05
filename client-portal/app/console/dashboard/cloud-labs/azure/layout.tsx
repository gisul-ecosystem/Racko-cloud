'use client';

import { LayoutGrid, Plus } from 'lucide-react';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';

const links: ServiceNavLink[] = [
  {
    href: tenantConsole.cloudLabsAzure,
    label: 'Overview',
    icon: <LayoutGrid className="h-4 w-4" />,
    exact: true,
  },
  {
    href: `${tenantConsole.cloudLabsAzure}/requests/new`,
    label: 'Create request',
    icon: <Plus className="h-4 w-4" />,
  },
];

export default function TenantAzureLabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireTenantService serviceKey="cloud-labs">
      <TenantServiceShell title="Azure Labs" subtitle="Cloud Labs" links={links}>
        {children}
      </TenantServiceShell>
    </RequireTenantService>
  );
}
