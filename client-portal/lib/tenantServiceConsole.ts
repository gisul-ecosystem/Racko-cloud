import type { CustomerCloudLabRequest } from './customerCloudLabsApi';
import { tenantCloudOwnerId } from './customerCloudLabsApi';
import type {
  ServiceKey,
  SuperAdminOrder,
  SuperAdminTenantVm,
} from './tenantTypes';

export interface TenantUsageBundle {
  vms: SuperAdminTenantVm[];
  orders: SuperAdminOrder[];
  azureLabs: CustomerCloudLabRequest[];
  awsLabs: CustomerCloudLabRequest[];
  gcpLabs: CustomerCloudLabRequest[];
}

export const TENANT_SERVICE_ORDER: ServiceKey[] = [
  'vm-management',
  'create-vm',
  'dedicated-server',
  'elastic-servers',
  'azure',
  'aws',
  'gcp',
  'cloud-labs',
  'machine-manager',
];

/** Super-admin management destination for a tenant's service entitlement. */
export function getTenantServiceManageHref(
  serviceKey: ServiceKey,
  tenantId: string
): string | null {
  const wl = `/super-admin-console/white-labelling/tenants/${encodeURIComponent(tenantId)}`;
  const ownerId = encodeURIComponent(tenantCloudOwnerId(tenantId));
  switch (serviceKey) {
    case 'vm-management':
    case 'create-vm':
    case 'dedicated-server':
    case 'elastic-servers':
    case 'cloud-labs':
    case 'machine-manager':
      return wl;
    case 'azure':
      return `/super-admin-console/azure/org-admin?ownerId=${ownerId}`;
    case 'aws':
      return `/super-admin-console/aws/org-admin?ownerId=${ownerId}`;
    default:
      return null;
  }
}

export function getTenantUsageCountForService(
  serviceKey: ServiceKey,
  usage: TenantUsageBundle
): number {
  switch (serviceKey) {
    case 'vm-management':
      return usage.vms.length;
    case 'create-vm':
      return usage.orders.length;
    case 'dedicated-server':
      return 0;
    case 'azure':
      return usage.azureLabs.length;
    case 'aws':
      return usage.awsLabs.length;
    case 'gcp':
      return usage.gcpLabs.length;
    default:
      return 0;
  }
}
