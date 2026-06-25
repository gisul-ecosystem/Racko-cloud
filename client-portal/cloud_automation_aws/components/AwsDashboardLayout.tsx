'use client';

import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';
import { AwsShellProvider, useAwsShell } from '../hooks/useAwsShell';
import { AwsSidebar } from './AwsSidebar';
import { AwsTopBar } from './AwsTopBar';

function AwsShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAwsShell();

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={<AwsSidebar />}
      topBar={<AwsTopBar />}
    >
      {children}
    </ServiceShellLayout>
  );
}

export function AwsDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AwsShellProvider>
      <AwsShell>{children}</AwsShell>
    </AwsShellProvider>
  );
}
