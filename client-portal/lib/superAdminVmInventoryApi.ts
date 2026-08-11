import { apiRequest } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type InventoryResourceType = 'platform_vm' | 'catalog_vm' | 'external_vm';
export type InventoryOwnerScope = 'admin' | 'tenant';
export type InventoryStatus = 'provisioning' | 'active' | 'suspended' | 'failed' | 'deleted';

export interface SuperAdminVmInventoryItem {
  inventoryId: string;
  resourceType: InventoryResourceType;
  sourceCollection: 'vms' | 'catalog_vms' | 'external_vms';
  sourceId: string;
  name: string;
  ipAddress?: string;
  protocol?: 'rdp' | 'ssh';
  status: InventoryStatus;
  originServiceKey: 'vm-management' | 'create-vm' | 'elastic-servers';
  originServiceLabel: 'VPS Hosting' | 'VM Catalog' | 'Elastic Server Import';
  originChannel: string;
  ownerScope: InventoryOwnerScope;
  ownerAdminId?: string;
  ownerAdminEmail?: string;
  ownerTenantId?: string;
  ownerTenantName?: string;
  mappedTenantId?: string;
  mappedTenantName?: string;
  mappedTenantUserId?: string;
  mappedTenantUserEmail?: string;
  mappedAssignments: Array<{
    username: string;
    isTenantUser: boolean;
    tenantName?: string;
    planDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly' | null;
    vmUsername?: string | null;
    vmPassword?: string | null;
    providerStartDate?: string | null;
    providerEndDate?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  mappedUsers: string[];
  assignmentLocation: string;
  projectId?: string;
  projectName?: string;
  orderId?: string;
  vmid?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SuperAdminVmInventoryListResult {
  items: SuperAdminVmInventoryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface SuperAdminVmInventoryOwnerOption {
  label: string;
  count: number;
}

export interface VmProviderMetadataImportRow {
  ipAddress: string;
  planDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly';
  username?: string;
  password?: string;
  providerStartDate?: string;
  providerEndDate?: string;
}

export interface VmProviderMetadataImportResult {
  total: number;
  updated: number;
}

export interface SuperAdminVmInventoryQuery {
  resourceType?: InventoryResourceType;
  originServiceKey?: 'vm-management' | 'create-vm' | 'elastic-servers';
  ownerScope?: InventoryOwnerScope;
  tenantId?: string;
  adminId?: string;
  projectId?: string;
  status?: InventoryStatus;
  search?: string;
  ownerSearch?: string;
  sortBy?: 'createdAt' | 'owner' | 'service';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  createdFrom?: string;
  createdTo?: string;
}

export async function fetchSuperAdminVmInventory(
  query: SuperAdminVmInventoryQuery = {}
): Promise<SuperAdminVmInventoryListResult> {
  const params = new URLSearchParams();

  if (query.resourceType) params.set('resourceType', query.resourceType);
  if (query.originServiceKey) params.set('originServiceKey', query.originServiceKey);
  if (query.ownerScope) params.set('ownerScope', query.ownerScope);
  if (query.tenantId) params.set('tenantId', query.tenantId);
  if (query.adminId) params.set('adminId', query.adminId);
  if (query.projectId) params.set('projectId', query.projectId);
  if (query.status) params.set('status', query.status);
  if (query.search && query.search.trim()) params.set('search', query.search.trim());
  if (query.ownerSearch && query.ownerSearch.trim()) {
    params.set('ownerSearch', query.ownerSearch.trim());
  }
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDirection) params.set('sortDirection', query.sortDirection);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.createdFrom) params.set('createdFrom', query.createdFrom);
  if (query.createdTo) params.set('createdTo', query.createdTo);

  const qs = params.toString();
  const path = qs
    ? `/api/v1/super-admin/vm-inventory?${qs}`
    : '/api/v1/super-admin/vm-inventory';

  const res = await apiRequest<ApiEnvelope<SuperAdminVmInventoryListResult>>(path);
  return res.data;
}

export async function fetchSuperAdminVmInventoryOwners(
  query: Omit<SuperAdminVmInventoryQuery, 'ownerSearch' | 'page' | 'limit'> = {}
): Promise<SuperAdminVmInventoryOwnerOption[]> {
  const params = new URLSearchParams();

  if (query.resourceType) params.set('resourceType', query.resourceType);
  if (query.originServiceKey) params.set('originServiceKey', query.originServiceKey);
  if (query.ownerScope) params.set('ownerScope', query.ownerScope);
  if (query.tenantId) params.set('tenantId', query.tenantId);
  if (query.adminId) params.set('adminId', query.adminId);
  if (query.projectId) params.set('projectId', query.projectId);
  if (query.status) params.set('status', query.status);
  if (query.search && query.search.trim()) params.set('search', query.search.trim());
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDirection) params.set('sortDirection', query.sortDirection);
  if (query.createdFrom) params.set('createdFrom', query.createdFrom);
  if (query.createdTo) params.set('createdTo', query.createdTo);

  const qs = params.toString();
  const path = qs
    ? `/api/v1/super-admin/vm-inventory/owners?${qs}`
    : '/api/v1/super-admin/vm-inventory/owners';

  const res = await apiRequest<ApiEnvelope<{ owners: SuperAdminVmInventoryOwnerOption[] }>>(path);
  return res.data.owners;
}

export async function importVmProviderMetadata(
  rows: VmProviderMetadataImportRow[]
): Promise<VmProviderMetadataImportResult> {
  const res = await apiRequest<ApiEnvelope<VmProviderMetadataImportResult>>(
    '/api/v1/super-admin/vm-inventory/provider-metadata/import',
    {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }
  );
  return res.data;
}
