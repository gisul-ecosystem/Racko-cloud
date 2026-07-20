'use client';

/** True when the browser is on a tenant portal route. */
export function isTenantPortalClient(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/tenant');
}
