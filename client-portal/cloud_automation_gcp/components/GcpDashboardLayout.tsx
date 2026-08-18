'use client';

import type { CSSProperties } from 'react';
import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';
import { PLATFORM_CLOUD_ACCENT } from '../../lib/cloudAccent';
import { hexToRgba } from '../../lib/tenantAccentStyles';
import { GcpShellProvider, useGcpShell } from '../hooks/useGcpShell';
import { GcpSidebar } from './GcpSidebar';
import { GcpTopBar } from './GcpTopBar';

const platformBrandStyle = {
  ['--cloud-accent' as string]: PLATFORM_CLOUD_ACCENT,
  ['--cloud-accent-soft' as string]: hexToRgba(PLATFORM_CLOUD_ACCENT, 0.1),
} as CSSProperties;

function GcpShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useGcpShell();

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      style={platformBrandStyle}
      sidebar={<GcpSidebar />}
      topBar={<GcpTopBar />}
    >
      {children}
    </ServiceShellLayout>
  );
}

export function GcpDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <GcpShellProvider>
      <GcpShell>{children}</GcpShell>
    </GcpShellProvider>
  );
}
