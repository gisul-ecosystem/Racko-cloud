export const ADMIN_SERVICE_CATALOG = [
  'create-vm',
  'dedicated-server',
  'vm-management',
  'elastic-servers',
  'azure',
  'aws',
  'gcp',
  'docs',
  'machine-manager',
] as const;

export type AdminServiceKey = (typeof ADMIN_SERVICE_CATALOG)[number];

/** Seeded for newly registered platform admins. */
export const DEFAULT_NEW_ADMIN_SERVICES: readonly AdminServiceKey[] = [
  'create-vm',
  'dedicated-server',
];

export const ADMIN_SERVICE_LABELS: Record<AdminServiceKey, string> = {
  'create-vm': 'VM Catalog',
  'dedicated-server': 'Dedicated Server',
  'vm-management': 'VPS Hosting',
  'elastic-servers': 'Elastic Server Import',
  azure: 'Azure Lab',
  aws: 'AWS Lab',
  gcp: 'GCP Lab',
  docs: 'Documentation',
  'machine-manager': 'Machine Manager',
};

export function isAdminServiceKey(value: string): value is AdminServiceKey {
  return (ADMIN_SERVICE_CATALOG as readonly string[]).includes(value);
}
