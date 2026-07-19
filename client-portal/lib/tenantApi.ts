import { apiRequest } from './apiClient';
import type {
  ApiEnvelope,
  AssignServiceInput,
  BrandingAssetType,
  CreateTenantAdminInput,
  CreateTenantInput,
  ManualWalletCreditInput,
  ManualWalletCreditResult,
  ManualWalletCreditsResult,
  SuperAdminOrder,
  SuperAdminOrderStatus,
  SuperAdminOverview,
  SuperAdminTenantVmsResult,
  SuperAdminWalletTransactionsResult,
  Tenant,
  TenantAdmin,
  TenantServiceConfig,
  TenantsListResult,
  TenantStatus,
  TenantWalletBalance,
  TemplateItemPricing,
  UpdateServiceConfigInput,
  UpdateTenantInput,
  VmManagementPlatformTemplates,
  VmManagementPricing,
} from './tenantTypes';

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

export async function fetchSuperAdminOverview(): Promise<SuperAdminOverview> {
  return unwrap(apiRequest<ApiEnvelope<SuperAdminOverview>>('/api/v1/super-admin/overview'));
}

export async function fetchTenants(params?: {
  page?: number;
  limit?: number;
  status?: TenantStatus;
}): Promise<TenantsListResult> {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.status) search.set('status', params.status);
  const qs = search.toString();
  return unwrap(
    apiRequest<ApiEnvelope<TenantsListResult>>(`/api/v1/tenants${qs ? `?${qs}` : ''}`)
  );
}

export async function fetchTenant(id: string): Promise<Tenant> {
  const data = await unwrap(apiRequest<ApiEnvelope<{ tenant: Tenant }>>(`/api/v1/tenants/${id}`));
  return data.tenant;
}

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ tenant: Tenant }>>('/api/v1/tenants', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
  return data.tenant;
}

export async function updateTenant(id: string, input: UpdateTenantInput): Promise<Tenant> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ tenant: Tenant }>>(`/api/v1/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  );
  return data.tenant;
}

export async function fetchTenantServices(tenantId: string): Promise<TenantServiceConfig[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ services: TenantServiceConfig[] }>>(
      `/api/v1/tenants/${tenantId}/services`
    )
  );
  return data.services;
}

export async function assignTenantService(
  tenantId: string,
  input: AssignServiceInput
): Promise<TenantServiceConfig> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ config: TenantServiceConfig }>>(
      `/api/v1/tenants/${tenantId}/services`,
      { method: 'POST', body: JSON.stringify(input) }
    )
  );
  return data.config;
}

export async function updateTenantService(
  tenantId: string,
  serviceKey: string,
  input: UpdateServiceConfigInput
): Promise<TenantServiceConfig> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ config: TenantServiceConfig }>>(
      `/api/v1/tenants/${tenantId}/services/${serviceKey}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    )
  );
  return data.config;
}

export async function removeTenantService(
  tenantId: string,
  serviceKey: string,
  force = false
): Promise<void> {
  const qs = force ? '?force=true' : '';
  await apiRequest<ApiEnvelope<unknown>>(
    `/api/v1/tenants/${tenantId}/services/${serviceKey}${qs}`,
    { method: 'DELETE' }
  );
}

export async function createTenantAdmin(
  tenantId: string,
  input: CreateTenantAdminInput
): Promise<TenantAdmin> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ admin: TenantAdmin }>>(`/api/v1/tenants/${tenantId}/admin`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
  return data.admin;
}

export async function fetchTenantAdmins(tenantId: string): Promise<TenantAdmin[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ admins: TenantAdmin[] }>>(
      `/api/v1/super-admin/tenants/${tenantId}/admins`
    )
  );
  return data.admins;
}

export async function fetchTenantVms(tenantId: string): Promise<SuperAdminTenantVmsResult> {
  return unwrap(
    apiRequest<ApiEnvelope<SuperAdminTenantVmsResult>>(
      `/api/v1/tenants/${tenantId}/vms`
    )
  );
}

export async function setTenantAdminActive(
  tenantId: string,
  tenantUserId: string,
  isActive: boolean
): Promise<TenantAdmin> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ admin: TenantAdmin }>>(
      `/api/v1/super-admin/tenants/${tenantId}/admins/${tenantUserId}/active`,
      { method: 'PATCH', body: JSON.stringify({ isActive }) }
    )
  );
  return data.admin;
}

export async function fetchVmManagementPlatformTemplates(
  tenantId: string
): Promise<VmManagementPlatformTemplates> {
  return unwrap(
    apiRequest<ApiEnvelope<VmManagementPlatformTemplates>>(
      `/api/v1/tenants/${tenantId}/services/vm-management/platform-templates`
    )
  );
}

export async function updateVmManagementAllowedTemplates(
  tenantId: string,
  allowedTemplateIds: number[]
): Promise<TenantServiceConfig> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ config: TenantServiceConfig }>>(
      `/api/v1/tenants/${tenantId}/services/vm-management/allowed-templates`,
      { method: 'PATCH', body: JSON.stringify({ allowedTemplateIds }) }
    )
  );
  return data.config;
}

export async function updateVmManagementPricing(
  tenantId: string,
  pricing: VmManagementPricing
): Promise<TenantServiceConfig> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ config: TenantServiceConfig }>>(
      `/api/v1/tenants/${tenantId}/services/vm-management/pricing`,
      { method: 'PATCH', body: JSON.stringify(pricing) }
    )
  );
  return data.config;
}

export async function updateVmManagementTemplatePricing(
  tenantId: string,
  templatePricing: Record<string, TemplateItemPricing>
): Promise<TenantServiceConfig> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ config: TenantServiceConfig }>>(
      `/api/v1/tenants/${tenantId}/services/vm-management/pricing`,
      { method: 'PATCH', body: JSON.stringify({ templatePricing }) }
    )
  );
  return data.config;
}

export async function uploadTenantBrandingAsset(
  tenantId: string,
  assetType: BrandingAssetType,
  file: File
): Promise<Tenant> {
  const form = new FormData();
  form.append('assetType', assetType);
  form.append('file', file);

  const data = await unwrap(
    apiRequest<ApiEnvelope<{ tenant: Tenant }>>(`/api/v1/tenants/${tenantId}/branding`, {
      method: 'POST',
      body: form,
    })
  );
  return data.tenant;
}

export async function deleteTenantBrandingAsset(
  tenantId: string,
  assetType: BrandingAssetType
): Promise<Tenant> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ tenant: Tenant }>>(
      `/api/v1/tenants/${tenantId}/branding?assetType=${encodeURIComponent(assetType)}`,
      { method: 'DELETE' }
    )
  );
  return data.tenant;
}

export async function fetchSuperAdminOrders(
  status?: SuperAdminOrderStatus
): Promise<SuperAdminOrder[]> {
  const qs = status ? `?status=${status}` : '';
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ orders: SuperAdminOrder[] }>>(
      `/api/v1/super-admin/orders${qs}`
    )
  );
  return data.orders;
}

export async function approveSuperAdminOrder(orderId: string): Promise<SuperAdminOrder> {
  return unwrap(
    apiRequest<ApiEnvelope<SuperAdminOrder>>(
      `/api/v1/super-admin/orders/${orderId}/approve`,
      { method: 'PATCH' }
    )
  );
}

export async function rejectSuperAdminOrder(
  orderId: string,
  reason: string
): Promise<SuperAdminOrder> {
  return unwrap(
    apiRequest<ApiEnvelope<SuperAdminOrder>>(
      `/api/v1/super-admin/orders/${orderId}/reject`,
      { method: 'PATCH', body: JSON.stringify({ reason }) }
    )
  );
}

export async function fetchTenantWalletBalance(tenantId: string): Promise<TenantWalletBalance> {
  return unwrap(
    apiRequest<ApiEnvelope<TenantWalletBalance>>(
      `/api/v1/super-admin/tenants/${tenantId}/wallet`
    )
  );
}

export async function fetchTenantWalletTransactions(
  tenantId: string,
  page = 1,
  limit = 20
): Promise<SuperAdminWalletTransactionsResult> {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return unwrap(
    apiRequest<ApiEnvelope<SuperAdminWalletTransactionsResult>>(
      `/api/v1/super-admin/tenants/${tenantId}/wallet/transactions?${qs}`
    )
  );
}

export async function fetchTenantManualCredits(
  tenantId: string,
  page = 1,
  limit = 20
): Promise<ManualWalletCreditsResult> {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return unwrap(
    apiRequest<ApiEnvelope<ManualWalletCreditsResult>>(
      `/api/v1/super-admin/tenants/${tenantId}/wallet/manual-credits?${qs}`
    )
  );
}

export async function manualCreditTenantWallet(
  tenantId: string,
  input: ManualWalletCreditInput,
  idempotencyKey?: string
): Promise<ManualWalletCreditResult> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return unwrap(
    apiRequest<ApiEnvelope<ManualWalletCreditResult>>(
      `/api/v1/super-admin/tenants/${tenantId}/wallet/manual-credit`,
      {
        method: 'POST',
        body: JSON.stringify(input),
        headers,
      }
    )
  );
}
