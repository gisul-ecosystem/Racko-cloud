'use client';

import {
  LayoutDashboard,
  Plus,
  Server,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';

const adminLinks: ServiceNavLink[] = [
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
  {
    href: tenantConsole.elasticUsers,
    label: 'Users',
    icon: <Users className="h-4 w-4" />,
  },
  {
    href: tenantConsole.elasticAssign,
    label: 'Assign Servers',
    icon: <UserCheck className="h-4 w-4" />,
  },
  {
    href: tenantConsole.elasticBulkAssign,
    label: 'Bulk Assign',
    icon: <Users className="h-4 w-4" />,
  },
];

const endUserLinks: ServiceNavLink[] = [
  {
    href: tenantConsole.elastic,
    label: 'My Servers',
    icon: <Server className="h-4 w-4" />,
    exact: true,
  },
];

export default function TenantElasticLayout({ children }: { children: React.ReactNode }) {
  const { tenantUser } = useTenantAuth();
  const isAdmin = tenantUser?.role === 'tenant_admin';
  const links = isAdmin ? adminLinks : endUserLinks;

  return (
    <RequireTenantService serviceKey="elastic-servers">
      <TenantServiceShell
        title="Elastic Server Import"
        subtitle={isAdmin ? 'External server console' : 'Assigned servers'}
        links={links}
      >
        {children}
      </TenantServiceShell>
    </RequireTenantService>
  );
}
