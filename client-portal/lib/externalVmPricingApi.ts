import { apiRequest } from './apiClient';
import type { CatalogType } from './createVmCatalogApi';

export type ExternalVmPricingPeriod = 'hourly' | 'monthly' | 'quarterly' | 'yearly';
export type PlanPeriodOverrides = Partial<Record<ExternalVmPricingPeriod, string>>;

export interface ExternalVmCategoryPricing {
  multiplier: number;
  plans: Record<string, PlanPeriodOverrides>;
}

export interface ExternalVmPricingConfig {
  provider: 'webyne';
  updatedAt: string | null;
  updatedBy: string | null;
  categories: Record<CatalogType, ExternalVmCategoryPricing>;
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

export async function getExternalVmPricing(
  provider: 'webyne' = 'webyne'
): Promise<ExternalVmPricingConfig> {
  return unwrap(
    apiRequest<ApiEnvelope<ExternalVmPricingConfig>>(
      `/api/v1/external-vm-pricing/${provider}`
    )
  );
}

export async function saveExternalVmPricing(
  provider: 'webyne',
  categories: ExternalVmPricingConfig['categories']
): Promise<ExternalVmPricingConfig> {
  return unwrap(
    apiRequest<ApiEnvelope<ExternalVmPricingConfig>>(
      `/api/v1/external-vm-pricing/${provider}`,
      {
        method: 'PUT',
        body: JSON.stringify({ categories }),
      }
    )
  );
}
