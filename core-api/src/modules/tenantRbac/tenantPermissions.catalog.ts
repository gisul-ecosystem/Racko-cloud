import type { ServiceKey } from '../../constants/serviceCatalog';

export interface OrgPermissionDef {
  key: string;
  label: string;
  group: string;
}

/** Permissions for tenant portal console. */
export const TENANT_PERMISSION_CATALOG: OrgPermissionDef[] = [
  { key: 'console.access', label: 'Access tenant console', group: 'Console' },
  { key: 'wallet.read', label: 'View wallet balance & history', group: 'Billing' },
  { key: 'wallet.topup', label: 'Top up tenant wallet', group: 'Billing' },
  { key: 'orders.read', label: 'View orders', group: 'Orders' },
  { key: 'orders.create', label: 'Create orders', group: 'Orders' },
  { key: 'vms.read', label: 'View VMs', group: 'VPS Hosting' },
  { key: 'vms.manage', label: 'Manage VM power & settings', group: 'VPS Hosting' },
  { key: 'vms.assign', label: 'Assign VMs to users', group: 'VPS Hosting' },
  { key: 'create_vm.read', label: 'View VM catalog', group: 'VM Catalog' },
  { key: 'create_vm.request', label: 'Request catalog VMs', group: 'VM Catalog' },
  { key: 'dedicated.read', label: 'View dedicated servers', group: 'Dedicated Server' },
  { key: 'dedicated.request', label: 'Request dedicated servers', group: 'Dedicated Server' },
  { key: 'elastic.read', label: 'View elastic servers', group: 'Elastic Servers' },
  { key: 'elastic.manage', label: 'Manage elastic servers', group: 'Elastic Servers' },
  { key: 'my_vms.read', label: 'View My VM Dashboard', group: 'My VM Dashboard' },
  { key: 'azure.read', label: 'View Azure labs', group: 'Azure' },
  { key: 'azure.manage', label: 'Create & manage Azure labs', group: 'Azure' },
  { key: 'aws.read', label: 'View AWS labs', group: 'AWS' },
  { key: 'aws.manage', label: 'Create & manage AWS labs', group: 'AWS' },
  { key: 'cloud_labs.read', label: 'View Cloud Labs', group: 'Cloud Labs' },
  { key: 'cloud_labs.manage', label: 'Create & manage Cloud Labs', group: 'Cloud Labs' },
  { key: 'users.manage', label: 'Manage tenant users', group: 'Team' },
  { key: 'rbac.roles.write', label: 'Create / edit roles', group: 'Access control' },
  { key: 'rbac.assign', label: 'Assign roles to people', group: 'Access control' },
  { key: 'projects.read', label: 'View projects', group: 'Projects' },
  { key: 'projects.manage', label: 'Create & manage projects', group: 'Projects' },
  { key: 'overview.read', label: 'View business overview dashboard', group: 'Overview' },
];

export const TENANT_ALL_PERMISSION_KEYS = TENANT_PERMISSION_CATALOG.map((p) => p.key);

/**
 * Permissions that only make sense when the platform has assigned the matching
 * service to the tenant. Anything not listed here is always available.
 */
export const SERVICE_SCOPED_PERMISSIONS: Partial<Record<ServiceKey, string[]>> = {
  'vm-management': ['vms.read', 'vms.manage', 'vms.assign'],
  'create-vm': ['create_vm.read', 'create_vm.request'],
  'dedicated-server': ['dedicated.read', 'dedicated.request'],
  'elastic-servers': ['elastic.read', 'elastic.manage'],
  'my-vms': ['my_vms.read'],
  azure: ['azure.read', 'azure.manage'],
  aws: ['aws.read', 'aws.manage'],
  'cloud-labs': ['cloud_labs.read', 'cloud_labs.manage'],
};

/** Permissions gated behind a service, mapped back to the service that unlocks them. */
const SERVICE_BY_PERMISSION = new Map<string, ServiceKey>(
  Object.entries(SERVICE_SCOPED_PERMISSIONS).flatMap(([serviceKey, keys]) =>
    (keys ?? []).map((key) => [key, serviceKey as ServiceKey] as const)
  )
);

/** Console, billing, orders, team and access-control permissions are never service-gated. */
export function isServiceScopedPermission(key: string): boolean {
  return SERVICE_BY_PERMISSION.has(key);
}

export function isPermissionAvailable(
  key: string,
  activeServices: ReadonlySet<ServiceKey>
): boolean {
  const required = SERVICE_BY_PERMISSION.get(key);
  return required === undefined || activeServices.has(required);
}

/** Permission keys a tenant may grant, given the services currently active for it. */
export function tenantPermissionKeysFor(activeServices: ReadonlySet<ServiceKey>): string[] {
  return TENANT_ALL_PERMISSION_KEYS.filter((key) => isPermissionAvailable(key, activeServices));
}

/** Catalog rows for the role editor, limited to the tenant's active services. */
export function tenantPermissionCatalogFor(
  activeServices: ReadonlySet<ServiceKey>
): OrgPermissionDef[] {
  return TENANT_PERMISSION_CATALOG.filter((p) => isPermissionAvailable(p.key, activeServices));
}

export const TENANT_SYSTEM_ROLE_SEEDS: Array<{
  slug: string;
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    slug: 'tenant_operator',
    name: 'Operator',
    description: 'Operate enabled tenant services without full admin.',
    permissions: [
      'console.access',
      'wallet.read',
      'orders.read',
      'orders.create',
      'vms.read',
      'vms.manage',
      'vms.assign',
      'create_vm.read',
      'create_vm.request',
      'dedicated.read',
      'dedicated.request',
      'elastic.read',
      'elastic.manage',
      'azure.read',
      'azure.manage',
      'aws.read',
      'aws.manage',
      'cloud_labs.read',
      'cloud_labs.manage',
      'users.manage',
      'projects.read',
      'projects.manage',
      'overview.read',
    ],
  },
  {
    slug: 'tenant_billing',
    name: 'Billing',
    description: 'Wallet and order visibility.',
    permissions: ['console.access', 'wallet.read', 'wallet.topup', 'orders.read', 'overview.read'],
  },
  {
    slug: 'tenant_viewer',
    name: 'Viewer',
    description: 'Read-only access to tenant resources.',
    permissions: [
      'console.access',
      'wallet.read',
      'orders.read',
      'vms.read',
      'create_vm.read',
      'dedicated.read',
      'elastic.read',
      'azure.read',
      'aws.read',
      'cloud_labs.read',
      'projects.read',
      'overview.read',
    ],
  },
];

export function isTenantPermission(key: string): boolean {
  return TENANT_ALL_PERMISSION_KEYS.includes(key);
}
