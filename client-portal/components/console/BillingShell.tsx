'use client';

import { RackoGlobalTopBar } from './RackoGlobalTopBar';
import { ServiceShellLayout } from './ServiceShellLayout';
import { useServiceShell } from './useServiceShell';
import { BillingSidebar } from './BillingSidebar';

export function BillingShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <BillingSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <RackoGlobalTopBar
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
