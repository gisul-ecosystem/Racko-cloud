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
  { key: 'azure.read', label: 'View Azure labs', group: 'Azure' },
  { key: 'azure.manage', label: 'Create & manage Azure labs', group: 'Azure' },
  { key: 'aws.read', label: 'View AWS labs', group: 'AWS' },
  { key: 'aws.manage', label: 'Create & manage AWS labs', group: 'AWS' },
  { key: 'users.manage', label: 'Manage tenant users', group: 'Team' },
  { key: 'rbac.roles.write', label: 'Create / edit roles', group: 'Access control' },
  { key: 'rbac.assign', label: 'Assign roles to people', group: 'Access control' },
  { key: 'projects.read', label: 'View projects', group: 'Projects' },
  { key: 'projects.manage', label: 'Create & manage projects', group: 'Projects' },
];

export const TENANT_ALL_PERMISSION_KEYS = TENANT_PERMISSION_CATALOG.map((p) => p.key);

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
      'users.manage',
      'projects.read',
      'projects.manage',
    ],
  },
  {
    slug: 'tenant_billing',
    name: 'Billing',
    description: 'Wallet and order visibility.',
    permissions: ['console.access', 'wallet.read', 'wallet.topup', 'orders.read'],
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
      'projects.read',
    ],
  },
];

export function isTenantPermission(key: string): boolean {
  return TENANT_ALL_PERMISSION_KEYS.includes(key);
}
