import { apiRequest } from './apiClient';

export type AccountVmPricingProvider = 'webyne' | 'dedicated';
export type AccountVmPricingScopeType = 'organization' | 'tenant';
export type AccountVmPricingPeriod = 'hourly' | 'monthly' | 'quarterly' | 'yearly';

export type PlanPeriodAbsoluteOverrides = Partial<
  Record<AccountVmPricingPeriod, number | null>
>;

export interface DedicatedPlanAbsoluteOverride {
  monthlyPrice?: number | null;
  setupFee?: number | null;
}

export interface AccountVmPricingOverride {
  _id: string;
  provider: AccountVmPricingProvider;
  scopeType: AccountVmPricingScopeType;
  orgId: string | null;
  tenantId: string | null;
  accountLabel: string | null;
  hourlyEnabled: boolean | null;
  categories: {
    linux?: { multiplier: number | null };
    windows?: { multiplier: number | null };
    gpu?: { multiplier: number | null };
    default?: { multiplier: number | null };
  };
  planOverrides: Record<string, PlanPeriodAbsoluteOverrides>;
  dedicatedPlanOverrides: Record<string, DedicatedPlanAbsoluteOverride>;
  notes: string | null;
  updatedAt: string;
}

export interface AccountVmPricingAccount {
  id: string;
  label: string;
  secondary?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

export async function searchAccountVmPricingAccounts(input: {
  scopeType: AccountVmPricingScopeType;
  q?: string;
  limit?: number;
}): Promise<AccountVmPricingAccount[]> {
  const qs = new URLSearchParams({ scopeType: input.scopeType });
  if (input.q) qs.set('q', input.q);
  if (input.limit) qs.set('limit', String(input.limit));
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ accounts: AccountVmPricingAccount[]; total: number }>>(
      `/api/v1/account-vm-pricing/accounts?${qs}`
    )
  );
  return data.accounts;
}

export async function listAccountVmPricingOverrides(
  provider: AccountVmPricingProvider
): Promise<AccountVmPricingOverride[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ overrides: AccountVmPricingOverride[]; total: number }>>(
      `/api/v1/account-vm-pricing/${provider}/overrides`
    )
  );
  return data.overrides;
}

export async function getAccountVmPricingOverride(
  provider: AccountVmPricingProvider,
  scopeType: AccountVmPricingScopeType,
  accountId: string
): Promise<AccountVmPricingOverride | null> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ override: AccountVmPricingOverride | null }>>(
      `/api/v1/account-vm-pricing/${provider}/overrides/${scopeType}/${accountId}`
    )
  );
  return data.override;
}

export async function saveAccountVmPricingOverride(
  provider: AccountVmPricingProvider,
  scopeType: AccountVmPricingScopeType,
  accountId: string,
  body: {
    hourlyEnabled?: boolean | null;
    categories?: AccountVmPricingOverride['categories'];
    planOverrides?: Record<string, PlanPeriodAbsoluteOverrides>;
    dedicatedPlanOverrides?: Record<string, DedicatedPlanAbsoluteOverride>;
    notes?: string | null;
  }
): Promise<AccountVmPricingOverride> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ override: AccountVmPricingOverride }>>(
      `/api/v1/account-vm-pricing/${provider}/overrides/${scopeType}/${accountId}`,
      { method: 'PUT', body: JSON.stringify(body) }
    )
  );
  return data.override;
}

export async function deleteAccountVmPricingOverride(
  provider: AccountVmPricingProvider,
  scopeType: AccountVmPricingScopeType,
  accountId: string
): Promise<void> {
  await apiRequest(
    `/api/v1/account-vm-pricing/${provider}/overrides/${scopeType}/${accountId}`,
    { method: 'DELETE' }
  );
}
