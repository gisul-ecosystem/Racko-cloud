export const SERVICE_CATALOG = ['vm-management', 'azure'] as const;
export type ServiceKey = (typeof SERVICE_CATALOG)[number];
