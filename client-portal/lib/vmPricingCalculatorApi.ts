import { apiRequest } from './apiClient';

export type CloudProvider = 'aws' | 'azure' | 'oci' | 'gcp';
export type PricingCategory = 'linux' | 'windows' | 'gpu';

export interface VmPricingCalculateInput {
  category: PricingCategory;
  durationDays?: number;
  specs?: {
    cpu: string | number;
    ram: string | number;
    disk: string | number;
  };
  canonicalSpec?: string;
  providers?: CloudProvider[];
}

export interface PricingPeriod {
  hr: number | null;
  monthly: number | null;
  quarterly: number | null;
  yearly: number | null;
}

export interface VmPricingSelectResult {
  provider: CloudProvider | 'webyne';
  region: string | null;
  category: PricingCategory;
  canonicalSpec: string;
  rawComputePricePerHr?: number;
  rawStoragePricePerHr?: number;
  rawIpPricePerHr?: number;
  rawTotalPricePerHr: number | null;
  rawComputePricePerHrInr?: number | null;
  rawStoragePricePerHrInr?: number | null;
  rawIpPricePerHrInr?: number | null;
  rawTotalPricePerHrInr?: number | null;
  instanceType?: string;
  currency?: string;
  autoProvisioned: boolean;
  reason?: string;
  providersUsed?: CloudProvider[];
  fetchedAt?: string;
  resolvedSkus?: Partial<Record<CloudProvider, string | null>>;
  usdToInr?: number;
  fxSource?: string;
  pricingUsd?: PricingPeriod;
  pricingInr?: PricingPeriod;
}

export interface VmPricingRow {
  provider: string;
  region: string;
  category: string;
  canonicalSpec: string;
  rawComputePricePerHr?: number;
  rawStoragePricePerHr?: number;
  rawIpPricePerHr?: number;
  rawTotalPricePerHr: number;
  rawTotalPricePerHrInr?: number | null;
  instanceType?: string;
  currency?: string;
  fetchedAt?: string;
  pricingUsd?: PricingPeriod;
  pricingInr?: PricingPeriod;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function calculateVmPricing(
  input: VmPricingCalculateInput
): Promise<VmPricingSelectResult> {
  const res = await apiRequest<ApiResponse<VmPricingSelectResult>>(
    '/api/v1/vm-catalog/pricing/calculate',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return res.data;
}

export async function listVmPricing(params: {
  providers?: string;
  provider?: string;
  category?: PricingCategory;
  canonicalSpec?: string;
  limit?: number;
}): Promise<{ rows: VmPricingRow[]; total: number; usdToInr?: number; fxSource?: string }> {
  const qs = new URLSearchParams();
  if (params.providers) qs.set('providers', params.providers);
  if (params.provider) qs.set('provider', params.provider);
  if (params.category) qs.set('category', params.category);
  if (params.canonicalSpec) qs.set('canonicalSpec', params.canonicalSpec);
  if (params.limit != null) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiRequest<
    ApiResponse<{ rows: VmPricingRow[]; total: number; usdToInr?: number; fxSource?: string }>
  >(`/api/v1/vm-catalog/pricing${suffix}`);
  return res.data;
}
