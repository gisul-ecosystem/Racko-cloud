'use client';

import type { CSSProperties } from 'react';
import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';
import { PLATFORM_CLOUD_ACCENT } from '../../lib/cloudAccent';
import { hexToRgba } from '../../lib/tenantAccentStyles';
import { AzureShellProvider, useAzureShell } from '../hooks/useAzureShell';
import { AzureSidebar } from './AzureSidebar';
import { AzureTopBar } from './AzureTopBar';

const platformBrandStyle = {
  ['--cloud-accent' as string]: PLATFORM_CLOUD_ACCENT,
  ['--cloud-accent-soft' as string]: hexToRgba(PLATFORM_CLOUD_ACCENT, 0.1),
} as CSSProperties;

function AzureShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAzureShell();

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      style={platformBrandStyle}
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
