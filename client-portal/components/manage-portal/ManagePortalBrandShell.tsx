'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { PLATFORM_CLOUD_ACCENT } from '@/lib/cloudAccent';
import { hexToRgba } from '@/lib/tenantAccentStyles';

/**
 * Applies tenant accent CSS vars for manage-users (Azure + AWS).
 * On platform hosts (no tenant), falls back to Racko red.
 */
export function ManagePortalBrandShell({ children }: { children: ReactNode }) {
  const { accentColor, tenantNotFound, loading } = useTenantBranding();
  const accent = tenantNotFound || loading ? PLATFORM_CLOUD_ACCENT : accentColor;

  const style = {
    ['--cloud-accent' as string]: accent,
    ['--cloud-accent-soft' as string]: hexToRgba(accent, 0.1),
  } as CSSProperties;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={style}>
      {children}
    </div>
  );
}
