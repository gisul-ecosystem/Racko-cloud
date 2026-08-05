'use client';

import type { CSSProperties } from 'react';
import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';
import { PLATFORM_CLOUD_ACCENT } from '../../lib/cloudAccent';
import { hexToRgba } from '../../lib/tenantAccentStyles';
import { AzureShellProvider, useAzureShell } from '../../cloud_automation/hooks/useAzureShell';
import { AzureLabsSidebar } from './AzureLabsSidebar';
import { AzureLabsTopBar } from './AzureLabsTopBar';

const platformBrandStyle = {
  ['--cloud-accent' as string]: PLATFORM_CLOUD_ACCENT,
  ['--cloud-accent-soft' as string]: hexToRgba(PLATFORM_CLOUD_ACCENT, 0.1),
} as CSSProperties;

function AzureLabsShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAzureShell();

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      style={platformBrandStyle}
      sidebar={<AzureLabsSidebar />}
      topBar={<AzureLabsTopBar />}
    >
      {children}
    </ServiceShellLayout>
  );
}

export function AzureLabsDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AzureShellProvider>
      <AzureLabsShell>{children}</AzureLabsShell>
    </AzureShellProvider>
  );
}
