'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { ServiceShellLayout } from '@/components/console/ServiceShellLayout';
import { TenantTopBar } from '@/components/tenant/TenantTopBar';
import { tenantConsole } from '@/lib/tenantAdminRoutes';

export default function TenantProjectsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useTenantAuth();
  const { loading: rbacLoading, hasPermission } = useTenantRbac();
  const { accentColor } = useTenantBranding();
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
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: accentColor, borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <ServiceShellLayout
      sidebarOpen={false}
      sidebar={null}
      topBar={<TenantTopBar title="Projects" subtitle="Client cost containers" onToggleSidebar={() => {}} />}
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}
