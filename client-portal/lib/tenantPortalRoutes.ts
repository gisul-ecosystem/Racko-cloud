import type { TenantUserRole } from '@/types/tenantPortal';
import { TENANT_CONSOLE, tenantVps } from '@/lib/tenantAdminRoutes';

/** Default landing page after tenant login. */
export function getTenantDefaultDashboardPath(role?: TenantUserRole | null): string {
  if (role === 'tenant_user') {
    return tenantVps.vms;
  }
  return TENANT_CONSOLE;
}

/** End-user VM/server views under the admin mirror (not admin-only create/restricted routes). */
export function isTenantEndUserResourcesPath(pathname: string): boolean {
  if (pathname === tenantVps.vms) return true;
  if (!pathname.startsWith(`${tenantVps.vms}/`)) return false;
  if (pathname.startsWith(tenantVps.createVm)) return false;
  if (pathname.startsWith(tenantVps.restricted)) return false;
  return true;
}
