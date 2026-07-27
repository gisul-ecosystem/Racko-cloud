'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { DedicatedServerSidebar } from '../../../components/console/DedicatedServerSidebar';
import { RackoGlobalTopBar } from '../../../components/console/RackoGlobalTopBar';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { useServiceShell } from '../../../components/console/useServiceShell';
import { RequireAdminService } from '../../../components/console/RequireAdminService';
import { DedicatedServerPortalProvider } from '../../../context/DedicatedServerPortalContext';
import { adminDedicatedServerPortalConfig } from '../../../lib/dedicatedServerPortalConfig';

export default function DedicatedServerLayout({ children }: { children: React.ReactNode }) {
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
    <RequireAdminService serviceKey="dedicated-server">
      <DedicatedServerPortalProvider
        config={adminDedicatedServerPortalConfig}
        isReady={!isLoading && isAuthenticated}
      >
        <ServiceShellLayout
        sidebarOpen={sidebarOpen}
        sidebar={
          <DedicatedServerSidebar
            sidebarOpen={sidebarOpen}
            onCloseSidebar={() => setSidebarOpen(false)}
          />
        }
        topBar={
          <RackoGlobalTopBar
            onToggleSidebar={toggleSidebar}
            title="Dedicated Server"
            subtitle="Request & manage dedicated servers"
          />
        }
        mainClassName="p-6 lg:p-8"
      >
        {children}
      </ServiceShellLayout>
      </DedicatedServerPortalProvider>
    </RequireAdminService>
  );
}
