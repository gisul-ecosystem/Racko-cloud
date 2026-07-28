'use client';

import { usePathname } from 'next/navigation';

export function isTenantWorkspacePath(pathname: string): boolean {
  return (
    pathname === '/console/login' ||
    pathname === '/console/forgot-password' ||
    pathname === '/console/reset-password' ||
    pathname.startsWith('/console/dashboard')
  );
}

/** True when the current route is the tenant workspace under /console. */
export function useIsTenantPortal(): boolean {
  const pathname = usePathname() ?? '';
  return isTenantWorkspacePath(pathname);
}
