import type { TenantServiceKey } from '@/types/tenantPortal';

/**
 * Mirrors core-api `SERVICE_SCOPED_PERMISSIONS` — any of these grants access to
 * the matching tenant service (read or manage).
 */
export const TENANT_SERVICE_PERMISSIONS: Partial<Record<TenantServiceKey, string[]>> = {
  'vm-management': ['vms.read', 'vms.manage', 'vms.assign'],
  'create-vm': ['create_vm.read', 'create_vm.request'],
  'dedicated-server': ['dedicated.read', 'dedicated.request'],
  'elastic-servers': ['elastic.read', 'elastic.manage'],
  azure: ['azure.read', 'azure.manage'],
  aws: ['aws.read', 'aws.manage'],
  'cloud-labs': ['cloud_labs.read', 'cloud_labs.manage'],
};

/** Hub/sidebar tiles that are not TenantServiceKey but use explicit RBAC keys. */
export const TENANT_HUB_SPECIAL_PERMISSIONS = {
  billing: ['wallet.read', 'wallet.topup'] as const,
  projects: ['projects.read', 'projects.manage'] as const,
  'access-control': ['rbac.roles.write', 'rbac.assign'] as const,
} as const;

export type TenantHubSpecialKey = keyof typeof TENANT_HUB_SPECIAL_PERMISSIONS;

/**
 * Whether the user may see or enter a tenant service.
 * Services without scoped permissions (docs, machine-manager) require only
 * that the service is active and the caller is past console auth.
 */
export function canAccessTenantService(
  serviceKey: TenantServiceKey,
  hasPermission: (...keys: string[]) => boolean,
  isTenantAdmin: boolean
): boolean {
  if (isTenantAdmin) return true;
  const keys = TENANT_SERVICE_PERMISSIONS[serviceKey];
  if (!keys?.length) return true;
  return hasPermission(...keys);
}

export function canAccessTenantHubTile(
  tileKey: TenantServiceKey | TenantHubSpecialKey,
  hasPermission: (...keys: string[]) => boolean,
  isTenantAdmin: boolean
): boolean {
  if (isTenantAdmin) return true;
  if (tileKey in TENANT_HUB_SPECIAL_PERMISSIONS) {
    const keys = TENANT_HUB_SPECIAL_PERMISSIONS[tileKey as TenantHubSpecialKey];
    return hasPermission(...keys);
  }
  return canAccessTenantService(tileKey as TenantServiceKey, hasPermission, false);
}
