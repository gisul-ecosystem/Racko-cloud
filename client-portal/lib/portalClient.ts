'use client';

import { isTenantWorkspacePath } from '@/lib/portalMode';

/** True when the browser is on a tenant portal route. */
export function isTenantPortalClient(): boolean {
  if (typeof window === 'undefined') return false;
  return isTenantWorkspacePath(window.location.pathname);
}
