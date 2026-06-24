import { tenantPortalRequest } from './tenantPortalApiClient';
import type {
  ApiEnvelope,
  TenantOrder,
  TenantOrderTemplate,
  TenantPortalUser,
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

export async function getTenantOrderTemplates(): Promise<TenantOrderTemplate[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ templates: TenantOrderTemplate[] }>>(
      '/api/v1/tenant-orders/templates'
    )
  );
  return data.templates;
}

export async function createTenantOrder(
  templateId: number,
  count: number
): Promise<TenantOrder> {
  return unwrap(
    tenantPortalRequest<ApiEnvelope<TenantOrder>>('/api/v1/tenant-orders', {
      method: 'POST',
      body: JSON.stringify({ templateId, count }),
    })
  );
}

export async function listTenantOrders(): Promise<TenantOrder[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ orders: TenantOrder[] }>>('/api/v1/tenant-orders')
  );
  return data.orders;
}
