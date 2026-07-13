export const SERVICE_CATALOG = [
  'vm-management',
  'elastic-servers',
  'azure',
  'aws',
  'gcp',
  'docs',
  'machine-manager',
] as const;
 
export type ServiceKey = (typeof SERVICE_CATALOG)[number];
