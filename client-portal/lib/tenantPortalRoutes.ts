import type { TenantUserRole } from '@/types/tenantPortal';

export function getTenantDefaultDashboardPath(role?: TenantUserRole | null): string {
  return role === 'tenant_user' ? '/tenant/dashboard/my-vms' : '/tenant/dashboard/vms';
}
