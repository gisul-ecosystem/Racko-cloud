'use client';

import { BarChart3, FolderKanban, Plus } from 'lucide-react';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const links: ServiceNavLink[] = [
  {
    href: tenantConsole.projects,
    label: 'All projects',
    icon: <FolderKanban className="h-4 w-4" />,
    exact: true,
  },
  {
    href: tenantConsole.projectsCreate,
    label: 'Create project',
    icon: <Plus className="h-4 w-4" />,
    isActive: (p) => p.startsWith(tenantConsole.projectsCreate),
  },
  {
    href: tenantConsole.projectsReports,
    label: 'Reports',
    icon: <BarChart3 className="h-4 w-4" />,
    isActive: (p) => p.startsWith(tenantConsole.projectsReports),
  },
];

export default function TenantProjectsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { tenantUser, isLoading, isAuthenticated } = useTenantAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/console/login');
      return;
    }
    if (tenantUser?.role !== 'tenant_admin') {
      router.replace(tenantConsole.hub);
    }
  }, [isLoading, isAuthenticated, tenantUser, router]);

  if (isLoading || !isAuthenticated || tenantUser?.role !== 'tenant_admin') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  return (
    <TenantServiceShell title="Projects" subtitle="Client cost containers" links={links}>
      {children}
    </TenantServiceShell>
  );
}
