'use client';

import { useContext } from 'react';
import { TenantBrandingContext } from '@/context/TenantBrandingContext';

/** Platform Racko red — default when no tenant branding is in scope. */
export const PLATFORM_CLOUD_ACCENT = '#B91C1C';

/** Tenant primary accent under /tenant; otherwise platform red. */
export function useCloudAccentColor(): string {
  const branding = useContext(TenantBrandingContext);
  return branding?.accentColor || PLATFORM_CLOUD_ACCENT;
}
