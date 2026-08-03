'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { ElasticServersSidebar } from '../../../components/console/ElasticServersSidebar';
import { RackoGlobalTopBar } from '../../../components/console/RackoGlobalTopBar';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { useServiceShell } from '../../../components/console/useServiceShell';
import { RequireAdminService } from '../../../components/console/RequireAdminService';

export default function ElasticServersLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace(user.role === 'super_admin' ? '/super-admin-console' : '/dashboard/user');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user || user.role !== 'admin') return null;

  return (
    <RequireAdminService serviceKey="elastic-servers">
      <ServiceShellLayout
        sidebarOpen={sidebarOpen}
        sidebar={
          <ElasticServersSidebar
            sidebarOpen={sidebarOpen}
            onCloseSidebar={() => setSidebarOpen(false)}
          />
        }
        topBar={
          <RackoGlobalTopBar
            onToggleSidebar={toggleSidebar}
            title="Elastic Server Import"
            subtitle="External server console"
          />
        }
        mainClassName="p-6 lg:p-8"
      >
        {children}
      </ServiceShellLayout>
    </RequireAdminService>
  );
}
