'use client';

import type { CSSProperties } from 'react';
import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';
import { PLATFORM_CLOUD_ACCENT } from '../../lib/cloudAccent';
import { hexToRgba } from '../../lib/tenantAccentStyles';
import { AwsShellProvider, useAwsShell } from '../hooks/useAwsShell';
import { AwsSidebar } from './AwsSidebar';
import { AwsTopBar } from './AwsTopBar';

const platformBrandStyle = {
  ['--cloud-accent' as string]: PLATFORM_CLOUD_ACCENT,
  ['--cloud-accent-soft' as string]: hexToRgba(PLATFORM_CLOUD_ACCENT, 0.1),
} as CSSProperties;

function AwsShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAwsShell();

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      style={platformBrandStyle}
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
