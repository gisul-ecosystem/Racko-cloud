'use client';

import { Briefcase, LayoutDashboard, Server, Wand2 } from 'lucide-react';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';

const links: ServiceNavLink[] = [
  {
    href: tenantConsole.machineManager,
    label: 'Overview',
    icon: <LayoutDashboard className="h-4 w-4" />,
    exact: true,
  },
  {
    href: tenantConsole.machineSetup,
    label: 'Setup Wizard',
    icon: <Wand2 className="h-4 w-4" />,
  },
  {
    href: tenantConsole.machineMachines,
    label: 'My Machines',
    icon: <Server className="h-4 w-4" />,
  },
  {
    href: tenantConsole.machineJobs,
    label: 'Jobs & Status',
    icon: <Briefcase className="h-4 w-4" />,
  },
];

export default function TenantMachineManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireTenantService serviceKey="machine-manager">
      <TenantServiceShell
        title="Machine Manager"
        subtitle="Install & manage software"
        links={links}
      >
        {children}
      </TenantServiceShell>
    </RequireTenantService>
  );
}
