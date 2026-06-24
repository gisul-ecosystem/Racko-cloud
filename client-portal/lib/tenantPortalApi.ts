import { tenantPortalRequest } from './tenantPortalApiClient';
import { getGatewayBaseUrl, getTenantDomainHeaders } from './gatewayUrl';
import type {
  ApiEnvelope,
  PlaceOrderInput,
  TenantBranding,
  TenantBrandingAssetType,
  TenantOrder,
  TenantOrderCatalog,
  TenantOrderQuote,
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
