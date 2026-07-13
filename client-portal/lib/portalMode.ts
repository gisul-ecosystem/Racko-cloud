'use client';

import { usePathname } from 'next/navigation';

/** True when the current route is under the tenant portal (`/tenant/...`). */
export function useIsTenantPortal(): boolean {
  const pathname = usePathname() ?? '';
  return pathname.startsWith('/tenant');
}
