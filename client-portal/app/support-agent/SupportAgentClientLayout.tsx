'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useServiceShell } from '@/components/console/useServiceShell';
import { ServiceShellLayout } from '@/components/console/ServiceShellLayout';
import { RackoGlobalTopBar } from '@/components/console/RackoGlobalTopBar';
import { SupportAgentSidebar } from '@/components/support-agent/SupportAgentSidebar';

const ALLOWED_ROLES = new Set(['support_agent', 'admin', 'super_admin']);

function isAllowedRole(role: string | undefined): boolean {
  return role != null && ALLOWED_ROLES.has(role);
}

export default function SupportAgentClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  const allowed = isAuthenticated && user && isAllowedRole(user.role);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      const dest = pathname ? `/login?redirect=${encodeURIComponent(pathname)}` : '/login';
      router.replace(dest);
      return;
    }
    if (!isAllowedRole(user.role)) {
      router.replace(
        user.role === 'staff'
          ? '/super-admin-console'
          : user.role === 'admin'
            ? '/console'
            : '/dashboard/user'
      );
    }
  }, [isLoading, isAuthenticated, user, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <SupportAgentSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <RackoGlobalTopBar
          onToggleSidebar={toggleSidebar}
          title="Support Agent"
          subtitle="Ticket queue and assignments"
        />
      }
    >
      {children}
    </ServiceShellLayout>
  );
}
