'use client';

import { usePathname } from 'next/navigation';
import { ServiceShellLayout } from '@/components/console/ServiceShellLayout';
import { useServiceShell } from '@/components/console/useServiceShell';
import { TenantSidebar } from './TenantSidebar';
import { TenantTopBar } from './TenantTopBar';

interface TenantShellProps {
  children: React.ReactNode;
}

function resolveShellTitles(pathname: string): { title: string; subtitle: string } {
  if (pathname.startsWith('/tenant/dashboard/plans')) {
    return { title: 'VM Plans', subtitle: 'Renew and extend plans' };
  }
  if (pathname.startsWith('/tenant/dashboard/profile')) {
    return { title: 'Profile', subtitle: 'Account settings' };
  }
  if (pathname.startsWith('/tenant/dashboard/notifications')) {
    return { title: 'Notifications', subtitle: 'Alerts and updates' };
  }
  return { title: 'Tenant Portal', subtitle: 'Services & resources' };
}

/** Shell for non-mirrored leftover routes (profile, notifications, plans). */
export function TenantShell({ children }: TenantShellProps) {
  const pathname = usePathname() ?? '';
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);
  const { title, subtitle } = resolveShellTitles(pathname);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <TenantSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <TenantTopBar
          onToggleSidebar={toggleSidebar}
          title={title}
          subtitle={subtitle}
        />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}
