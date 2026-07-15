'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { CreateVmCatalogSidebar } from '../../../components/console/CreateVmCatalogSidebar';
import { RackoGlobalTopBar } from '../../../components/console/RackoGlobalTopBar';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { useServiceShell } from '../../../components/console/useServiceShell';

export default function CreateVmCatalogLayout({ children }: { children: React.ReactNode }) {
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
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <CreateVmCatalogSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <RackoGlobalTopBar
          onToggleSidebar={toggleSidebar}
          title="VM Catalog"
          subtitle="Browse plans & manage VMs"
        />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}
