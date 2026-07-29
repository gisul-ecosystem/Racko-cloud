'use client';

import { FileText, LayoutGrid } from 'lucide-react';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';

const links: ServiceNavLink[] = [
  {
    href: tenantConsole.aws,
    label: 'Overview',
    icon: <LayoutGrid className="h-4 w-4" />,
    exact: true,
  },
  {
    href: tenantConsole.awsRequests,
    label: 'Requests',
    icon: <FileText className="h-4 w-4" />,
  },
];

export default function TenantAwsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireTenantService serviceKey="aws">
      <TenantServiceShell title="AWS Services" subtitle="Cloud automation" links={links}>
        {children}
      </TenantServiceShell>
    </RequireTenantService>
  );
}
