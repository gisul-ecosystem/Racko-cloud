'use client';

import {
  LayoutDashboard,
  Plus,
  Server,
  Upload,
} from 'lucide-react';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';

const links: ServiceNavLink[] = [
  {
    href: tenantConsole.elasticOverview,
    label: 'Overview',
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    href: tenantConsole.elastic,
    label: 'My Servers',
    icon: <Server className="h-4 w-4" />,
    exact: true,
  },
  {
    href: tenantConsole.elasticAdd,
    label: 'Add Server',
    icon: <Plus className="h-4 w-4" />,
  },
  {
    href: tenantConsole.elasticBulk,
    label: 'Bulk Import',
    icon: <Upload className="h-4 w-4" />,
  },
];

export default function TenantElasticLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireTenantService serviceKey="elastic-servers">
      <TenantServiceShell
        title="Elastic Server Import"
        subtitle="External server console"
        links={links}
      >
        {children}
      </TenantServiceShell>
    </RequireTenantService>
  );
}
