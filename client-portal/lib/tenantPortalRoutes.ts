import type { TenantPortalUser, TenantUserRole } from '@/types/tenantPortal';
import { tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';

/** Default landing page after tenant login. */
export function getTenantDefaultDashboardPath(
  role?: TenantUserRole | null,
  opts?: { isConsoleOperator?: boolean } | TenantPortalUser | null
): string {
  const isOperator =
    opts && typeof opts === 'object' && 'isConsoleOperator' in opts
      ? Boolean(opts.isConsoleOperator)
      : false;
  if (role === 'tenant_user' && !isOperator) {
    return tenantVps.vms;
  }
  // Tenant admins and console operators land on the business Overview.
  return tenantConsole.overview;
}

/** End-user VM/server views under the admin mirror (not admin-only create/restricted routes). */
export function isTenantEndUserResourcesPath(pathname: string): boolean {
  if (pathname === tenantVps.vms) return true;
  if (!pathname.startsWith(`${tenantVps.vms}/`)) return false;
  if (pathname.startsWith(tenantVps.createVm)) return false;
  if (pathname.startsWith(tenantVps.restricted)) return false;
  return true;
}
