import { apiRequest } from './apiClient';
import type {
  AdminPricingConfig,
  AdminWallet,
  AdminWalletTransactionsResult,
  AdminVmQuote,
  AdminQuoteInput,
  AdminTemplateRates,
  AdminCloudChargeResult,
} from '../types/adminBilling';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

// ── Pricing ────────────────────────────────────────────────────────────────

export async function getAdminPricing(): Promise<AdminPricingConfig> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminPricingConfig>>('/api/v1/admin-billing/pricing')
  );
}

export async function saveAdminPricing(
  templatePricing: Record<string, AdminTemplateRates>
): Promise<AdminPricingConfig> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminPricingConfig>>('/api/v1/admin-billing/pricing', {
      method: 'PATCH',
      body: JSON.stringify({ templatePricing }),
    })
  );
}

// ── Wallet ─────────────────────────────────────────────────────────────────

export async function getMyAdminWallet(): Promise<AdminWallet> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminWallet>>('/api/v1/admin-billing/wallet/me')
  );
}

export async function getAdminWalletByUserId(userId: string): Promise<AdminWallet> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminWallet>>(`/api/v1/admin-billing/wallet/${userId}`)
  );
}

export async function getAdminWalletTransactionsByUserId(
  userId: string,
  page = 1,
  limit = 20
): Promise<AdminWalletTransactionsResult> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminWalletTransactionsResult>>(
      `/api/v1/admin-billing/wallet/${userId}/transactions?page=${page}&limit=${limit}`
    )
  );
}

export async function getMyAdminWalletTransactions(
  page = 1,
  limit = 20
): Promise<AdminWalletTransactionsResult> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminWalletTransactionsResult>>(
      `/api/v1/admin-billing/wallet/me/transactions?page=${page}&limit=${limit}`
    )
  );
}

export async function creditAdminWallet(
  userId: string,
  amount: number
): Promise<AdminWallet> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminWallet>>('/api/v1/admin-billing/wallet/credit', {
      method: 'POST',
      body: JSON.stringify({ userId, amount }),
    })
  );
}

// ── Quote ──────────────────────────────────────────────────────────────────

export async function quoteAdminVmCreation(input: AdminQuoteInput): Promise<AdminVmQuote> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminVmQuote>>('/api/v1/admin-billing/quote', {
      method: 'POST',
      body: JSON.stringify({
        templateId: input.templateId,
        cpuCores: input.cpuCores,
        memoryGb: input.memoryGb,
        diskGb: input.diskGb,
        count: input.count ?? 1,
        billingPeriod: input.billingPeriod ?? 'monthly',
      }),
    })
  );
}

export interface AdminTopupResult {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export async function createAdminWalletTopup(amount: number): Promise<AdminTopupResult> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminTopupResult>>('/api/v1/admin-billing/wallet/me/topup', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    })
  );
}

export async function chargeAdminWalletForCloudRequest(
  amountUsd: number,
  relatedRequestId?: string | null,
  provider: 'azure' | 'aws' = 'azure'
): Promise<AdminCloudChargeResult> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminCloudChargeResult>>(
      '/api/v1/admin-billing/wallet/me/charge-cloud-request',
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

export async function refundAdminWalletCloudCharge(
  amountInr: number,
  relatedRequestId?: string | null
): Promise<AdminWallet> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminWallet>>('/api/v1/admin-billing/wallet/me/refund-cloud-request', {
      method: 'POST',
      body: JSON.stringify({
        amountInr,
        ...(relatedRequestId ? { relatedRequestId } : {}),
      }),
    })
  );
}

export async function linkAdminWalletCloudCharge(relatedRequestId: string): Promise<void> {
  await unwrap(
    apiRequest<ApiEnvelope<{ relatedRequestId: string }>>(
      '/api/v1/admin-billing/wallet/me/link-cloud-request',
      {
        method: 'POST',
        body: JSON.stringify({ relatedRequestId }),
      }
    )
  );
}
