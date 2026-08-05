'use client';

import { BarChart3, FolderKanban, Plus } from 'lucide-react';
import { TenantServiceShell } from '@/components/tenant/TenantServiceShell';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import type { ServiceNavLink } from '@/components/console/ServiceNavSidebar';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useTenantAuth } from '@/context/TenantAuthContext';

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
  const { isLoading, isAuthenticated } = useTenantAuth();
  const { loading: rbacLoading, hasPermission } = useTenantRbac();
  const canAccess = hasPermission('projects.read', 'projects.manage');

  useEffect(() => {
    if (isLoading || rbacLoading) return;
    if (!isAuthenticated) {
      router.replace('/console/login');
      return;
    }
    if (!canAccess) {
      router.replace(tenantConsole.hub);
    }
  }, [isLoading, rbacLoading, isAuthenticated, canAccess, router]);

  if (isLoading || rbacLoading || !isAuthenticated || !canAccess) {
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
