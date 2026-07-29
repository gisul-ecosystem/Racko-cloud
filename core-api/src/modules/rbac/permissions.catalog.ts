/**
 * Control-plane permission catalog (Super Admin dashboard).
 */

export interface PermissionDef {
  key: string;
  label: string;
  group: string;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // VM management / cluster control
  { key: 'vm_management.manage', label: 'Manage VM management dashboard', group: 'VM Management' },
  { key: 'machine_manager.manage', label: 'Manage machine manager', group: 'Machine Manager' },
  { key: 'admin_users.manage', label: 'Manage admin users & services', group: 'Admin Users' },

  // Webyne VM requests
  { key: 'webyne.requests.read', label: 'View Webyne VM requests', group: 'Webyne VM requests' },
  { key: 'webyne.requests.approve', label: 'Approve / fulfill requests', group: 'Webyne VM requests' },
  { key: 'webyne.requests.attach', label: 'Attach VMs to admins', group: 'Webyne VM requests' },
  { key: 'webyne.requests.power', label: 'Power / Virtualizor controls', group: 'Webyne VM requests' },
  { key: 'webyne.requests.reject', label: 'Reject requests', group: 'Webyne VM requests' },

  // Dedicated server requests
  { key: 'dedicated.requests.read', label: 'View dedicated server requests', group: 'Dedicated Servers' },
  { key: 'dedicated.requests.attach', label: 'Attach dedicated server requests', group: 'Dedicated Servers' },
  { key: 'dedicated.requests.reject', label: 'Reject dedicated server requests', group: 'Dedicated Servers' },

  // Webyne / external pricing
  { key: 'pricing.webyne.read', label: 'View Webyne pricing', group: 'Webyne pricing' },
  { key: 'pricing.webyne.write', label: 'Edit Webyne plans & multiplier', group: 'Webyne pricing' },
  { key: 'pricing.hourly.toggle', label: 'Toggle hourly pricing', group: 'Webyne pricing' },

  // Other Super Admin service areas
  { key: 'pricing.calculator.read', label: 'Use VM pricing calculator', group: 'VM Pricing Calculator' },
  { key: 'azure.manage', label: 'Access Azure service management', group: 'Azure Services' },
  { key: 'aws.manage', label: 'Access AWS lab management', group: 'AWS Services' },
  { key: 'white_labelling.manage', label: 'Manage white labelling & tenants', group: 'White Labelling' },

  // Access control (staff management)
  { key: 'rbac.roles.write', label: 'Create / edit roles', group: 'Access control' },
  { key: 'rbac.assign', label: 'Assign roles to people', group: 'Access control' },
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key) as readonly string[];

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]['key'];

const KEY_SET = new Set(ALL_PERMISSION_KEYS);

export function isKnownPermission(key: string): boolean {
  return KEY_SET.has(key);
}

export function assertKnownPermissions(keys: string[]): string[] {
  const invalid = keys.filter((k) => !KEY_SET.has(k));
  if (invalid.length > 0) {
    throw new Error(`Unknown permission(s): ${invalid.join(', ')}`);
  }
  return [...new Set(keys)];
}

/** Built-in system roles seeded on first Access Control load. */
export const SYSTEM_ROLE_SEEDS: Array<{
  slug: string;
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    slug: 'ops_fulfillment',
    name: 'Ops Fulfillment',
    description: 'Approve, attach, and control Webyne catalog VMs.',
    permissions: [
      'webyne.requests.read',
      'webyne.requests.approve',
      'webyne.requests.attach',
      'webyne.requests.power',
      'webyne.requests.reject',
    ],
  },
  {
    slug: 'billing_ops',
    name: 'Billing Ops',
    description: 'Manage Webyne sell pricing and hourly toggle.',
    permissions: [
      'pricing.webyne.read',
      'pricing.webyne.write',
      'pricing.hourly.toggle',
      'pricing.calculator.read',
    ],
  },
  {
    slug: 'read_only_auditor',
    name: 'Read-only Auditor',
    description: 'View Webyne requests and pricing without changes.',
    permissions: ['webyne.requests.read', 'pricing.webyne.read', 'pricing.calculator.read'],
  },
  {
    slug: 'platform_ops',
    name: 'Platform Ops',
    description: 'Access platform operations dashboards and service consoles.',
    permissions: [
      'vm_management.manage',
      'machine_manager.manage',
      'admin_users.manage',
      'white_labelling.manage',
      'azure.manage',
      'aws.manage',
      'dedicated.requests.read',
      'dedicated.requests.attach',
      'dedicated.requests.reject',
    ],
  },
];
