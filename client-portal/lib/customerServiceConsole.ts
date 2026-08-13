import type { AdminServiceKey } from './adminServicesApi';
import type { CustomerCloudLabRequest } from './customerCloudLabsApi';
import type { ICatalogVm } from './vmCatalogApi';
import type { IDedicatedServer } from './dedicatedServerApi';
import type { IVM } from './vmApi';

export interface CustomerUsageBundle {
  vms: IVM[];
  catalogRequests: ICatalogVm[];
  dedicatedRequests: IDedicatedServer[];
  azureLabs: CustomerCloudLabRequest[];
  awsLabs: CustomerCloudLabRequest[];
  gcpLabs: CustomerCloudLabRequest[];
}

/** Super-admin management destination for a customer's service entitlement. */
export function getCustomerServiceManageHref(
  serviceKey: AdminServiceKey,
  customerId: string,
  email: string
): string | null {
  const emailQ = email ? `&email=${encodeURIComponent(email)}` : '';
  switch (serviceKey) {
    case 'vm-management':
      return `/super-admin-console/vm-management/vms?adminId=${encodeURIComponent(customerId)}${emailQ}`;
    case 'create-vm':
      return `/super-admin-console/webyne-vm-requests/${encodeURIComponent(customerId)}`;
    case 'dedicated-server':
      return `/super-admin-console/dedicated-server-requests/${encodeURIComponent(customerId)}`;
    case 'azure':
      return `/super-admin-console/azure/org-admin?ownerId=${encodeURIComponent(customerId)}${emailQ}`;
    case 'aws':
      return `/super-admin-console/aws/org-admin?ownerId=${encodeURIComponent(customerId)}${emailQ}`;
    case 'machine-manager':
      return `/super-admin-console/machine-manager`;
    default:
      return null;
  }
}

export function getUsageCountForService(
  serviceKey: AdminServiceKey,
  usage: CustomerUsageBundle
): number {
  switch (serviceKey) {
    case 'vm-management':
      return usage.vms.length;
    case 'create-vm':
      return usage.catalogRequests.length;
    case 'dedicated-server':
      return usage.dedicatedRequests.length;
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

export const CUSTOMER_SERVICE_ORDER: AdminServiceKey[] = [
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
