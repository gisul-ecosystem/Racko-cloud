import type { TenantUserRole } from '@/types/tenantPortal';

export function getTenantDefaultDashboardPath(_role?: TenantUserRole | null): string {
  return '/tenant/dashboard/vms';
}
