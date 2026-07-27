export const SERVICE_CATALOG = [
  'vm-management',
  'create-vm',
  'dedicated-server',
  'elastic-servers',
  'azure',
  'aws',
  'gcp',
  'docs',
  'machine-manager',
] as const;
 
export type ServiceKey = (typeof SERVICE_CATALOG)[number];
