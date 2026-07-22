'use client';

import { ServiceShellLayout } from '@/components/console/ServiceShellLayout';
import { useServiceShell } from '@/components/console/useServiceShell';
import { TenantBillingSidebar } from '@/components/tenant/TenantBillingSidebar';
import { TenantTopBar } from '@/components/tenant/TenantTopBar';

export function TenantBillingShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <TenantBillingSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <TenantTopBar
          onToggleSidebar={toggleSidebar}
          title="Billing"
          subtitle="Wallet & transactions"
        />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}
