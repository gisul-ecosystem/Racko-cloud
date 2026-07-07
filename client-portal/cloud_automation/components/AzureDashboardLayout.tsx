'use client';

import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';
import { AzureShellProvider, useAzureShell } from '../hooks/useAzureShell';
import { AzureSidebar } from './AzureSidebar';
import { AzureTopBar } from './AzureTopBar';

function AzureShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAzureShell();

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={<AzureSidebar />}
      topBar={<AzureTopBar />}
    >
      {children}
    </ServiceShellLayout>
  );
}

export function AzureDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AzureShellProvider>
      <AzureShell>{children}</AzureShell>
    </AzureShellProvider>
  );
}
