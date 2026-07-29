import { apiRequest } from './apiClient';

export type CloudProvider = 'aws' | 'azure' | 'oci' | 'gcp';
export type PricingCategory = 'linux' | 'windows' | 'gpu';
export type PricingCalculatorMode = 'vm' | 'storage_only';
export type ManagedDiskType = 'standard_hdd' | 'standard_ssd';

export interface VmPricingCalculateInput {
  category: PricingCategory;
  mode?: PricingCalculatorMode;
  durationDays?: number;
  specs?: {
    cpu?: string | number;
    ram?: string | number;
    disk: string | number;
    diskType?: ManagedDiskType;
  };
  canonicalSpec?: string;
  providers?: CloudProvider[];
  /** When true, price nested-virt-capable SKUs only (Docker/KVM guests). */
  nestedVirtualization?: boolean;
}

export interface PricingPeriod {
  hr: number | null;
  monthly: number | null;
  quarterly: number | null;
  yearly: number | null;
}

export interface VmPricingDynamicMappings {
  aws?: {
    instanceType: string;
    ebsGb?: number;
    source?: string;
  } | null;
  azure?: {
    vmSize: string;
    diskGb?: number;
    source?: string;
  } | null;
  oci?: {
    shape: string;
    ocpus?: number;
    memoryInGBs?: number;
    bootVolumeGb?: number;
    source?: string;
  } | null;
  gcp?: {
    machineType: string;
    diskGb?: number;
    acceleratorCount?: number;
    source?: string;
  } | null;
}

export interface VmPricingDynamicMeta {
  cached: boolean;
  written: number;
  providersUsed?: CloudProvider[];
  pricingMode?: 'normal' | 'nested';
  mappings?: VmPricingDynamicMappings | null;
  errors?: string[];
  errorCount?: number;
}

export interface VmPricingSelectResult {
  provider: CloudProvider | 'webyne';
  region: string | null;
  category: PricingCategory;
  canonicalSpec: string;
  mode?: PricingCalculatorMode;
  pricingMode?: 'normal' | 'nested';
  nestedVirtualization?: boolean;
  rawComputePricePerHr?: number;
  rawStoragePricePerHr?: number;
  /** @deprecated Prefer rawPublicIpPricePerHr */
  rawIpPricePerHr?: number;
  rawPublicIpPricePerHr?: number;
  rawPrivateIpPricePerHr?: number;
  rawTotalPricePerHr: number | null;
  rawTotalWithPublicIpPerHr?: number;
  rawTotalWithPrivateIpPerHr?: number;
  rawComputePricePerHrInr?: number | null;
  rawStoragePricePerHrInr?: number | null;
  rawIpPricePerHrInr?: number | null;
  rawPublicIpPricePerHrInr?: number | null;
  rawPrivateIpPricePerHrInr?: number | null;
  rawTotalPricePerHrInr?: number | null;
  rawTotalWithPublicIpPerHrInr?: number | null;
  rawTotalWithPrivateIpPerHrInr?: number | null;
  instanceType?: string;
  currency?: string;
  autoProvisioned: boolean;
  reason?: string;
  providersUsed?: CloudProvider[];
  dynamicPricing?: VmPricingDynamicMeta;
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
  nestedVirtualization?: boolean;
}): Promise<{ rows: VmPricingRow[]; total: number; usdToInr?: number; fxSource?: string }> {
  const qs = new URLSearchParams();
  if (params.providers) qs.set('providers', params.providers);
  if (params.provider) qs.set('provider', params.provider);
  if (params.category) qs.set('category', params.category);
  if (params.canonicalSpec) qs.set('canonicalSpec', params.canonicalSpec);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.nestedVirtualization != null) {
    qs.set('nestedVirtualization', params.nestedVirtualization ? 'true' : 'false');
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiRequest<
    ApiResponse<{ rows: VmPricingRow[]; total: number; usdToInr?: number; fxSource?: string }>
  >(`/api/v1/vm-catalog/pricing${suffix}`);
  return res.data;
}
