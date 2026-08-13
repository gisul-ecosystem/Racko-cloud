import { apiRequest } from './apiClient';
import {
  fetchServiceCatalog,
  type ServiceCatalogItem,
} from './serviceCatalogApi';

export const ADMIN_SERVICE_KEYS = [
  'create-vm',
  'dedicated-server',
  'vm-management',
  'elastic-servers',
  'my-vms',
  'azure',
  'aws',
  'gcp',
  'cloud-labs',
  'docs',
  'machine-manager',
] as const;

export type AdminServiceKey = (typeof ADMIN_SERVICE_KEYS)[number];

export type AdminServiceStatus = 'active' | 'suspended';

export interface AdminAssignedService {
  serviceKey: AdminServiceKey;
  status: AdminServiceStatus;
  label?: string;
}

export interface AdminServiceCatalogItem {
  serviceKey: AdminServiceKey;
  label: string;
  description?: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function fetchMyAdminServices(): Promise<AdminAssignedService[]> {
  const res = await apiRequest<ApiResponse<{ services: AdminAssignedService[] }>>(
    '/api/v1/admin-services/me'
  );
  return res.data.services;
}

/** Product services assignable to org admins — from Mongo `service_catalog`. */
export async function fetchAdminAssignableCatalog(): Promise<AdminServiceCatalogItem[]> {
  const items = await fetchServiceCatalog({ kind: 'product', scope: 'admin' });
  return items.map((item) => ({
    serviceKey: item.key as AdminServiceKey,
    label: item.label,
    description: item.description,
  }));
}

/** Product services assignable to tenants — from Mongo `service_catalog`. */
export async function fetchTenantAssignableCatalog(): Promise<ServiceCatalogItem[]> {
  return fetchServiceCatalog({ kind: 'product', scope: 'tenant' });
}

export async function fetchAdminServicesForUser(adminId: string): Promise<{
  services: AdminAssignedService[];
  catalog: AdminServiceCatalogItem[];
}> {
  const res = await apiRequest<
    ApiResponse<{ services: AdminAssignedService[]; catalog: AdminServiceCatalogItem[] }>
  >(`/api/v1/admin-services/admins/${adminId}`);
  return res.data;
}

export async function assignAdminService(
  adminId: string,
  serviceKey: AdminServiceKey
): Promise<AdminAssignedService> {
  const res = await apiRequest<ApiResponse<{ service: AdminAssignedService }>>(
    `/api/v1/admin-services/admins/${adminId}`,
    { method: 'POST', body: JSON.stringify({ serviceKey }) }
  );
  return res.data.service;
}

export async function updateAdminServiceStatus(
  adminId: string,
  serviceKey: AdminServiceKey,
  status: AdminServiceStatus
): Promise<AdminAssignedService> {
  const res = await apiRequest<ApiResponse<{ service: AdminAssignedService }>>(
    `/api/v1/admin-services/admins/${adminId}/${serviceKey}`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
  return res.data.service;
}

export async function removeAdminService(
  adminId: string,
  serviceKey: AdminServiceKey
): Promise<void> {
  await apiRequest(`/api/v1/admin-services/admins/${adminId}/${serviceKey}`, {
    method: 'DELETE',
  });
}

/** Maps console hub tile id → entitlement key. Billing is always allowed (no key). */
export const CONSOLE_TILE_SERVICE_KEY: Record<string, AdminServiceKey | null> = {
  vps: 'vm-management',
  'create-vm': 'create-vm',
  'dedicated-server': 'dedicated-server',
  billing: null,
  elastic: 'elastic-servers',
  'my-vm-dashboard': 'my-vms',
  azure: 'azure',
  aws: 'aws',
  gcp: 'gcp',
  'cloud-labs': 'cloud-labs',
  docs: 'docs',
  'machine-manager': 'machine-manager',
};
