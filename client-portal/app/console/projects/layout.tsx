'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { RackoGlobalTopBar } from '../../../components/console/RackoGlobalTopBar';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { useServiceShell } from '../../../components/console/useServiceShell';

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const { setSidebarOpen } = useServiceShell(false);

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
      sidebarOpen={false}
      sidebar={
        null
      }
      topBar={
        <RackoGlobalTopBar
          title="Projects"
        />
      }
    >
      {children}
    </ServiceShellLayout>
  );
}
