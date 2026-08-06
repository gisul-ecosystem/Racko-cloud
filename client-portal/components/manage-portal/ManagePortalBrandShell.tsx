'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { PLATFORM_CLOUD_ACCENT } from '@/lib/cloudAccent';
import { shouldUseTenantManagePortalBranding } from '@/lib/gatewayUrl';
import { hexToRgba } from '@/lib/tenantAccentStyles';

/**
 * Applies accent CSS vars for manage-users (Azure + AWS).
 * Tenant accent only on real tenant hosts; platform/admin + localhost → Racko red.
 */
export function ManagePortalBrandShell({ children }: { children: ReactNode }) {
  const { accentColor, tenantNotFound } = useTenantBranding();
  const isTenant = shouldUseTenantManagePortalBranding() && !tenantNotFound;
  const accent = isTenant ? accentColor : PLATFORM_CLOUD_ACCENT;

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
