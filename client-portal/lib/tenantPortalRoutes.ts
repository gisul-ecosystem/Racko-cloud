import type { TenantUserRole } from '@/types/tenantPortal';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';

export function getTenantDefaultDashboardPath(_role?: TenantUserRole | null): string {
  return TENANT_CONSOLE;
}
