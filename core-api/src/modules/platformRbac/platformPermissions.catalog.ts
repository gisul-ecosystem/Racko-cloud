export interface OrgPermissionDef {
  key: string;
  label: string;
  group: string;
}

export type PlatformServiceEntitlementKey =
  | 'create-vm'
  | 'dedicated-server'
  | 'vm-management'
  | 'elastic-servers'
  | 'azure'
  | 'aws'
  | 'gcp'
  | 'cloud-labs'
  | 'docs'
  | 'machine-manager';

/** Permissions for platform admin console (customer org). */
export const PLATFORM_PERMISSION_CATALOG: OrgPermissionDef[] = [
  { key: 'console.access', label: 'Access services console', group: 'Console' },
  { key: 'billing.read', label: 'View wallet & billing history', group: 'Billing' },
  { key: 'billing.topup', label: 'Top up wallet', group: 'Billing' },
  { key: 'vms.read', label: 'View VPS / managed VMs', group: 'VPS Hosting' },
  { key: 'vms.manage', label: 'Manage VPS power & settings', group: 'VPS Hosting' },
  { key: 'vms.assign', label: 'Assign VMs to team users', group: 'VPS Hosting' },
  { key: 'create_vm.read', label: 'View VM catalog requests', group: 'VM Catalog' },
  { key: 'create_vm.request', label: 'Submit VM catalog requests', group: 'VM Catalog' },
  { key: 'dedicated.read', label: 'View dedicated server requests', group: 'Dedicated Server' },
  { key: 'dedicated.request', label: 'Submit dedicated server requests', group: 'Dedicated Server' },
  { key: 'elastic.read', label: 'View elastic servers', group: 'Elastic Servers' },
  { key: 'elastic.manage', label: 'Manage elastic servers & users', group: 'Elastic Servers' },
  { key: 'azure.read', label: 'View Azure labs', group: 'Azure' },
  { key: 'azure.manage', label: 'Create & manage Azure labs', group: 'Azure' },
  { key: 'aws.read', label: 'View AWS labs', group: 'AWS' },
  { key: 'aws.manage', label: 'Create & manage AWS labs', group: 'AWS' },
  { key: 'gcp.read', label: 'View GCP services', group: 'GCP' },
  { key: 'gcp.manage', label: 'Manage GCP services', group: 'GCP' },
  { key: 'cloud_labs.read', label: 'View Cloud Labs', group: 'Cloud Labs' },
  { key: 'cloud_labs.manage', label: 'Create & manage Cloud Labs', group: 'Cloud Labs' },
  { key: 'machine_manager.manage', label: 'Use machine manager', group: 'Machine Manager' },
  { key: 'docs.read', label: 'View documentation', group: 'Docs' },
  { key: 'team.manage', label: 'Manage team users', group: 'Team' },
  { key: 'rbac.roles.write', label: 'Create / edit roles', group: 'Access control' },
  { key: 'rbac.assign', label: 'Assign roles to people', group: 'Access control' },
];

export const PLATFORM_ALL_PERMISSION_KEYS = PLATFORM_PERMISSION_CATALOG.map((p) => p.key);

const ALWAYS_ALLOWED_PLATFORM_PERMISSION_KEYS = [
  'console.access',
  'billing.read',
  'billing.topup',
  'rbac.roles.write',
  'rbac.assign',
] as const;

const SERVICE_PERMISSION_KEYS: Record<PlatformServiceEntitlementKey, string[]> = {
  'create-vm': ['create_vm.read', 'create_vm.request'],
  'dedicated-server': ['dedicated.read', 'dedicated.request'],
  'vm-management': ['vms.read', 'vms.manage', 'vms.assign', 'team.manage'],
  'elastic-servers': ['elastic.read', 'elastic.manage'],
  azure: ['azure.read', 'azure.manage'],
  aws: ['aws.read', 'aws.manage'],
  gcp: ['gcp.read', 'gcp.manage'],
  'cloud-labs': ['cloud_labs.read', 'cloud_labs.manage'],
  docs: ['docs.read'],
  'machine-manager': ['machine_manager.manage'],
};

export const PLATFORM_SYSTEM_ROLE_SEEDS: Array<{
  slug: string;
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    slug: 'org_operator',
    name: 'Operator',
    description: 'Day-to-day console operations across enabled services.',
    permissions: [
      'console.access',
      'billing.read',
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
      'machine_manager.manage',
      'docs.read',
      'team.manage',
    ],
  },
  {
    slug: 'org_billing',
    name: 'Billing',
    description: 'Wallet and billing access only.',
    permissions: ['console.access', 'billing.read', 'billing.topup'],
  },
  {
    slug: 'org_viewer',
    name: 'Viewer',
    description: 'Read-only access to console services.',
    permissions: [
      'console.access',
      'billing.read',
      'vms.read',
      'create_vm.read',
      'dedicated.read',
      'elastic.read',
      'azure.read',
      'aws.read',
      'gcp.read',
      'cloud_labs.read',
      'docs.read',
    ],
  },
];

export function isPlatformPermission(key: string): boolean {
  return PLATFORM_ALL_PERMISSION_KEYS.includes(key);
}

export function platformPermissionKeysForServices(
  serviceKeys: readonly PlatformServiceEntitlementKey[]
): string[] {
  const allowed = new Set<string>(ALWAYS_ALLOWED_PLATFORM_PERMISSION_KEYS);
  for (const serviceKey of serviceKeys) {
    for (const permission of SERVICE_PERMISSION_KEYS[serviceKey] || []) {
      allowed.add(permission);
    }
  }
  return [...allowed];
}
