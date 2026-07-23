import { tenantPortalRequest } from './tenantPortalApiClient';
import { getGatewayBaseUrl, getTenantDomainHeaders } from './gatewayUrl';
import type {
  ApiEnvelope,
  PlaceOrderInput,
  TenantBranding,
  TenantBrandingAssetType,
  TenantAssignedService,
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

/** Session poll (~60s) for tenant end-users — 401 when access window ended. */
export async function tenantAccessCheck(): Promise<{ allowed: boolean }> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<{ allowed: boolean }>>('/api/v1/tenant-auth/access-check')
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read branding asset'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Favicons cannot reliably use blob: URLs in browsers — they keep the page's
 * default icon. Data URLs work for <link rel="icon">.
 */
export async function fetchTenantBrandingAssetDataUrl(
  assetType: TenantBrandingAssetType,
  cacheBust?: string | number
): Promise<string | null> {
  const blob = await fetchTenantBrandingAsset(assetType, cacheBust);
  if (!blob) return null;
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl || null;
}

export async function getTenantServices(): Promise<TenantAssignedService[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ services: TenantAssignedService[] }>>(
      '/api/v1/tenant-services'
    )
  );
  return data.services;
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

export interface TenantCloudChargeResult {
  balance: number;
  currency: string;
  chargedInr: number;
  amountUsd: number;
  usdToInrRate: number;
  provider: 'azure' | 'aws';
}

export async function chargeTenantWalletForCloudRequest(
  amountUsd: number,
  relatedRequestId?: string | null,
  provider: 'azure' | 'aws' = 'azure'
): Promise<TenantCloudChargeResult> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantCloudChargeResult>>(
      '/api/v1/tenant-wallet/charge-cloud-request',
      {
        method: 'POST',
        body: JSON.stringify({
          amountUsd,
          provider,
          ...(relatedRequestId ? { relatedRequestId } : {}),
        }),
      }
    )
  );
}

export async function refundTenantWalletCloudCharge(
  amountInr: number,
  relatedRequestId?: string | null,
  provider: 'azure' | 'aws' = 'azure'
): Promise<TenantWallet> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantWallet>>('/api/v1/tenant-wallet/refund-cloud-request', {
      method: 'POST',
      body: JSON.stringify({
        amountInr,
        provider,
        ...(relatedRequestId ? { relatedRequestId } : {}),
      }),
    })
  );
}

export async function linkTenantWalletCloudCharge(
  relatedRequestId: string,
  provider: 'azure' | 'aws' = 'azure'
): Promise<void> {
  await unwrap(
    tenantPortalRequest<ApiEnvelope<{ relatedRequestId: string }>>(
      '/api/v1/tenant-wallet/link-cloud-request',
      {
        method: 'POST',
        body: JSON.stringify({ relatedRequestId, provider }),
      }
    )
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
