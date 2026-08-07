'use client';

import {
  LayoutDashboard,
  Plus,
  Server,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { useTenantRbac } from '@/context/TenantRbacContext';
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
  const pathname = usePathname() ?? '';
  const { isConsoleStaff, hasPermission } = useTenantRbac();
  const showAdminNav = isConsoleStaff && hasPermission('elastic.manage', 'elastic.read');
  const links = showAdminNav ? adminLinks : endUserLinks;

  // Assigned end users open console without elastic.read/manage — skip admin gate
  // (backend still enforces assignment + access window).
  const isConsole = /\/elastic-servers\/[^/]+\/console\/?$/.test(pathname);
  if (isConsole) {
    return <>{children}</>;
  }

  return (
    <RequireTenantService serviceKey="elastic-servers">
      <TenantServiceShell
        title="Elastic Server Import"
        subtitle={showAdminNav ? 'External server console' : 'Assigned servers'}
        links={links}
      >
        {children}
      </TenantServiceShell>
    </RequireTenantService>
  );
}
