import { tenantPortalRequest } from './tenantPortalApiClient';
import { getGatewayBaseUrl, getTenantDomainHeaders } from './gatewayUrl';
import type {
  ApiEnvelope,
  BulkAssignTenantVmsInput,
  BulkAssignTenantVmsResult,
  BulkCreateTenantUsersResult,
  PlaceOrderInput,
  TenantBranding,
  TenantBrandingAssetType,
  TenantUserProfile,
  TenantUsersResult,
  TenantVmAssignmentCountsResult,
  TenantVmConsoleResult,
  TenantVmDetails,
  TenantVmLiveStatus,
  TenantVmOperationResult,
  TenantOrder,
  TenantOrderCatalog,
  TenantOrderQuote,
  TenantNotificationsResult,
  TenantPlan,
  TenantPlanActionResult,
  TenantPlanHistoryEntry,
  TenantPlanQuote,
  TenantPortalUser,
  TenantTemplateDetail,
  TenantTopupResult,
  TenantVmsResult,
  TenantWallet,
  TenantWalletTransactionsResult,
} from '../types/tenantPortal';

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

export async function tenantLogin(
  email: string,
  password: string
): Promise<{ accessToken: string; tenantUser: TenantPortalUser }> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<{ accessToken: string; tenantUser: TenantPortalUser }>>(
      '/api/v1/tenant-auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }), skipAuth: true }
    )
  );
}

export async function tenantForgotPassword(email: string): Promise<void> {
  await tenantPortalRequest<ApiEnvelope<Record<string, never>>>(
    '/api/v1/tenant-auth/forgot-password',
    { method: 'POST', body: JSON.stringify({ email }), skipAuth: true }
  );
}

export async function tenantResetPassword(token: string, newPassword: string): Promise<void> {
  await tenantPortalRequest<ApiEnvelope<Record<string, never>>>(
    '/api/v1/tenant-auth/reset-password',
    { method: 'POST', body: JSON.stringify({ token, newPassword }), skipAuth: true }
  );
}

export async function getTenantBranding(): Promise<{
  tenantId: string;
  branding: TenantBranding;
}> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<{ tenantId: string; branding: TenantBranding }>>(
      '/api/v1/tenant-branding',
      { skipAuth: true }
    )
  );
}

/**
 * Fetch binary branding asset from GET /api/v1/tenant-branding/asset?assetType=…
 * Uses X-Tenant-Domain on localhost so the gateway can resolve the tenant.
 */
export async function fetchTenantBrandingAsset(
  assetType: TenantBrandingAssetType,
  cacheBust?: string | number
): Promise<Blob | null> {
  const params = new URLSearchParams({ assetType });
  if (cacheBust !== undefined) params.set('v', String(cacheBust));

  const res = await fetch(
    `${getGatewayBaseUrl()}/api/v1/tenant-branding/asset?${params.toString()}`,
    {
      headers: getTenantDomainHeaders(),
      credentials: 'omit',
      cache: 'no-store',
    }
  );
  if (!res.ok) return null;
  return res.blob();
}

export async function fetchTenantBrandingAssetObjectUrl(
  assetType: TenantBrandingAssetType,
  cacheBust?: string | number
): Promise<string | null> {
  const blob = await fetchTenantBrandingAsset(assetType, cacheBust);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function getTenantWallet(): Promise<TenantWallet> {
  return unwrap(tenantPortalRequest<ApiEnvelope<TenantWallet>>('/api/v1/tenant-wallet'));
}

export async function getTenantWalletTransactions(
  page = 1,
  limit = 20
): Promise<TenantWalletTransactionsResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantWalletTransactionsResult>>(
      `/api/v1/tenant-wallet/transactions?page=${page}&limit=${limit}`
    )
  );
}

export async function createTenantWalletTopup(amount: number): Promise<TenantTopupResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantTopupResult>>('/api/v1/tenant-wallet/topup', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    })
  );
}

export async function getTenantOrderCatalog(): Promise<TenantOrderCatalog> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantOrderCatalog>>('/api/v1/tenant-orders/templates')
  );
}

export async function getTenantOrderTemplateDetail(
  templateId: number
): Promise<TenantTemplateDetail> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ template: TenantTemplateDetail }>>(
      `/api/v1/tenant-orders/templates/${templateId}`
    )
  );
  return data.template;
}

export async function quoteTenantOrder(input: PlaceOrderInput): Promise<TenantOrderQuote> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantOrderQuote>>('/api/v1/tenant-orders/quote', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
}

export async function createTenantOrder(input: PlaceOrderInput): Promise<TenantOrder> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantOrder>>('/api/v1/tenant-orders', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
}

export async function listTenantOrders(): Promise<TenantOrder[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ orders: TenantOrder[] }>>('/api/v1/tenant-orders')
  );
  return data.orders;
}

/** @deprecated Use getTenantOrderCatalog */
export async function getTenantOrderTemplates() {
  const catalog = await getTenantOrderCatalog();
  return catalog.templates;
}

export async function listTenantPlans(): Promise<TenantPlan[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ plans: TenantPlan[] }>>('/api/v1/tenant-plans')
  );
  return data.plans;
}

export async function getTenantPlan(vmId: string): Promise<TenantPlan> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ plan: TenantPlan }>>(`/api/v1/tenant-plans/${vmId}`)
  );
  return data.plan;
}

export async function quoteTenantPlan(vmId: string): Promise<TenantPlanQuote> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantPlanQuote>>(`/api/v1/tenant-plans/${vmId}/quote`, {
      method: 'POST',
    })
  );
}

export async function extendTenantPlan(vmId: string): Promise<TenantPlanActionResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantPlanActionResult>>(
      `/api/v1/tenant-plans/${vmId}/extend`,
      { method: 'POST' }
    )
  );
}

export async function renewTenantPlan(vmId: string): Promise<TenantPlanActionResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantPlanActionResult>>(
      `/api/v1/tenant-plans/${vmId}/renew`,
      { method: 'POST' }
    )
  );
}

export async function listTenantPlanHistory(vmId: string): Promise<TenantPlanHistoryEntry[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ history: TenantPlanHistoryEntry[] }>>(
      `/api/v1/tenant-plans/${vmId}/history`
    )
  );
  return data.history;
}

export async function listTenantNotifications(
  page = 1,
  limit = 20
): Promise<TenantNotificationsResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantNotificationsResult>>(
      `/api/v1/tenant-notifications?page=${page}&limit=${limit}`
    )
  );
}

export async function markTenantNotificationRead(notificationId: string): Promise<void> {
  await tenantPortalRequest<ApiEnvelope<{ id: string }>>(
    `/api/v1/tenant-notifications/${notificationId}/read`,
    { method: 'PATCH' }
  );
}

export async function createTenantUser(
  email: string,
  password: string
): Promise<TenantUserProfile> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ user: TenantUserProfile }>>('/api/v1/tenant-users/single', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  );
  return data.user;
}

export async function bulkCreateTenantUsers(input: {
  emailPrefix: string;
  count: number;
  password?: string;
}): Promise<BulkCreateTenantUsersResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<BulkCreateTenantUsersResult>>('/api/v1/tenant-users/bulk', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
}

export async function fetchTenantUsers(): Promise<TenantUsersResult> {
  return unwrap(tenantPortalRequest<ApiEnvelope<TenantUsersResult>>('/api/v1/tenant-users'));
}

export async function setTenantUserActive(
  userId: string,
  isActive: boolean
): Promise<TenantUserProfile> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ user: TenantUserProfile }>>(
      `/api/v1/tenant-users/${userId}/active`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }
    )
  );
  return data.user;
}

export async function deleteTenantUser(userId: string): Promise<void> {
  await tenantPortalRequest<ApiEnvelope<Record<string, never>>>(`/api/v1/tenant-users/${userId}`, {
    method: 'DELETE',
  });
}

export async function fetchTenantVms(filters?: {
  status?: string;
  node?: string;
}): Promise<TenantVmsResult> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.node) params.set('node', filters.node);
  const qs = params.toString();
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmsResult>>(
      `/api/v1/tenant-vms${qs ? `?${qs}` : ''}`
    )
  );
}

export async function fetchTenantVm(vmId: string): Promise<TenantVmDetails> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmDetails>>(`/api/v1/tenant-vms/${vmId}`)
  );
}

export async function fetchTenantVmStatus(vmId: string): Promise<TenantVmLiveStatus> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ status: TenantVmLiveStatus }>>(
      `/api/v1/tenant-vms/${vmId}/status`
    )
  );
  return data.status;
}

export async function startTenantVm(vmId: string): Promise<TenantVmOperationResult> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ result: TenantVmOperationResult }>>(
      `/api/v1/tenant-vms/${vmId}/start`,
      { method: 'POST' }
    )
  );
  return data.result;
}

export async function stopTenantVm(vmId: string): Promise<TenantVmOperationResult> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ result: TenantVmOperationResult }>>(
      `/api/v1/tenant-vms/${vmId}/stop`,
      { method: 'POST' }
    )
  );
  return data.result;
}

export async function restartTenantVm(vmId: string): Promise<TenantVmOperationResult> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ result: TenantVmOperationResult }>>(
      `/api/v1/tenant-vms/${vmId}/restart`,
      { method: 'POST' }
    )
  );
  return data.result;
}

export async function openTenantVmConsole(
  vmId: string,
  protocol?: 'rdp' | 'ssh' | 'vnc'
): Promise<TenantVmConsoleResult> {
  const qs = protocol ? `?protocol=${protocol}` : '';
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmConsoleResult>>(
      `/api/v1/tenant-vms/${vmId}/console${qs}`
    )
  );
}

export async function fetchAssignableTenantVms(): Promise<TenantVmsResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmsResult>>('/api/v1/tenant-vms/assign/available')
  );
}

export async function fetchTenantVmAssignmentCounts(): Promise<Record<string, number>> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmAssignmentCountsResult>>(
      '/api/v1/tenant-vms/assign/counts'
    )
  );
  return data.counts;
}

export async function fetchAssignedTenantVmsForUser(userId: string): Promise<TenantVmsResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantVmsResult>>(
      `/api/v1/tenant-vms/assign/user/${userId}`
    )
  );
}

export async function assignTenantVms(
  userId: string,
  vmIds: string[]
): Promise<{ assigned: number }> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<{ assigned: number }>>('/api/v1/tenant-vms/assign', {
      method: 'POST',
      body: JSON.stringify({ userId, vmIds }),
    })
  );
}

export async function bulkAssignTenantVms(
  payload: BulkAssignTenantVmsInput
): Promise<BulkAssignTenantVmsResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<BulkAssignTenantVmsResult>>(
      '/api/v1/tenant-vms/assign/bulk',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    )
  );
}

export async function unassignTenantVm(vmId: string): Promise<void> {
  await tenantPortalRequest<ApiEnvelope<Record<string, never>>>(
    `/api/v1/tenant-vms/assign/${vmId}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Complete payment for a pending_payment order.
 * Requires backend POST /api/v1/tenant-orders/:id/complete-payment.
 */
export async function completeTenantOrderPayment(orderId: string): Promise<TenantOrder> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantOrder>>(
      `/api/v1/tenant-orders/${orderId}/complete-payment`,
      { method: 'POST' }
    )
  );
}
