import { config } from '../../config';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface ResellerSelectInput {
  canonicalSpec?: string;
  category: string;
  mode?: 'vm' | 'storage_only';
  durationDays: number;
  specs?: { cpu?: string; ram?: string; disk?: string; diskType?: 'standard_hdd' | 'standard_ssd' };
  /** Limit cheapest-provider search to these clouds. Omit for all. */
  providers?: string[] | string;
  /** Backward-compatible alias for providers. */
  provider?: string[] | string;
  /** When true, select/price only nested-virt-capable SKUs. */
  nestedVirtualization?: boolean;
}

export interface ResellerSelectResult {
  provider: 'webyne' | 'aws' | 'azure' | 'gcp' | 'oci';
  region: string | null;
  category: string;
  canonicalSpec: string;
  mode?: 'vm' | 'storage_only';
  pricingMode?: 'normal' | 'nested';
  nestedVirtualization?: boolean;
  rawTotalPricePerHr: number | null;
  rawComputePricePerHr?: number;
  rawStoragePricePerHr?: number;
  /** @deprecated Prefer rawPublicIpPricePerHr */
  rawIpPricePerHr?: number;
  rawPublicIpPricePerHr?: number;
  rawPrivateIpPricePerHr?: number;
  rawTotalWithPublicIpPerHr?: number;
  rawTotalWithPrivateIpPerHr?: number;
  instanceType?: string;
  currency?: string;
  autoProvisioned: boolean;
  reason?: string;
  providersUsed?: string[];
}

export interface ResellerProvisionInput {
  provider: string;
  region?: string | null;
  category: string;
  canonicalSpec: string;
  catalogVmId: string;
  resourceGroup?: string;
  assignPublicIp?: boolean;
  vmSize?: string;
  imageReference?: {
    publisher?: string;
    offer?: string;
    sku?: string;
    version?: string;
    id?: string;
    osType?: string;
  };
}

export interface ResellerProvisionResult {
  provider: string;
  providerInstanceId: string;
  region: string;
  ip: string | null;
  privateIp?: string | null;
  hostname?: string | null;
  username: string;
  password: string;
  protocol: 'ssh' | 'rdp';
  meta?: {
    vmName?: string;
    resourceGroup?: string;
    nicName?: string;
    pipName?: string | null;
    assignPublicIp?: boolean;
    vmSize?: string;
  };
}

export interface ResellerTerminateInput {
  provider: string;
  region?: string | null;
  providerInstanceId: string;
  resourceGroup?: string;
  vmName?: string;
  subscriptionId?: string;
}

export type ResellerClientError = Error & { status?: number; code?: string };

function resellerBaseUrl(): string {
  return String(config.RESELLER_SERVICE_URL || 'http://127.0.0.1:3005').replace(/\/$/, '');
}

function resellerErrorCode(status: number): string {
  if (status === 400) return 'RESELLER_VALIDATION_ERROR';
  if (status === 409) return 'RESELLER_CONFLICT';
  if (status === 503) return 'RESELLER_UNAVAILABLE';
  if (status >= 500) return 'RESELLER_UNAVAILABLE';
  return 'RESELLER_ERROR';
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'ABORT_ERR')
  );
}

function rethrowResellerClientError(err: unknown, logLabel: string, timeoutMs: number): never {
  if (isAbortError(err)) {
    throw new AppError(
      `Reseller ${logLabel} timed out after ${Math.round(timeoutMs / 1000)}s.`,
      504,
      'RESELLER_TIMEOUT'
    );
  }
  const resellerErr = err as ResellerClientError;
  if (resellerErr instanceof Error && typeof resellerErr.status === 'number') {
    const status = resellerErr.status;
    throw new AppError(resellerErr.message, status, resellerErrorCode(status));
  }
  throw err;
}

async function postReseller<T>(
  path: string,
  body: unknown,
  logLabel: string,
  /** 0 = no client-side abort (wait until reseller responds). */
  timeoutMs = 300_000
): Promise<T> {
  const url = `${resellerBaseUrl()}${path}`;
  logger.info(`[Reseller] ${logLabel}`, { url, timeoutMs });

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Internal-Secret': config.INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    });

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: T;
      message?: string;
      error?: string;
    };

    if (!res.ok || data.success === false) {
      const err: ResellerClientError = new Error(
        data.message || data.error || `Reseller ${logLabel} failed (HTTP ${res.status})`
      );
      err.status = res.status;
      throw err;
    }

    return (data.data ?? data) as T;
  } catch (err) {
    return rethrowResellerClientError(err, logLabel, timeoutMs);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getReseller<T>(
  path: string,
  logLabel: string,
  timeoutMs = 30_000
): Promise<T> {
  const url = `${resellerBaseUrl()}${path}`;
  logger.info(`[Reseller] ${logLabel}`, { url });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Internal-Secret': config.INTERNAL_SERVICE_SECRET,
      },
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: T;
      message?: string;
      error?: string;
    };

    if (!res.ok || data.success === false) {
      const err: ResellerClientError = new Error(
        data.message || data.error || `Reseller ${logLabel} failed (HTTP ${res.status})`
      );
      err.status = res.status;
      throw err;
    }

    return (data.data ?? data) as T;
  } catch (err) {
    return rethrowResellerClientError(err, logLabel, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

export async function selectProvider(
  input: ResellerSelectInput
): Promise<ResellerSelectResult> {
  // Live multi-cloud quotes can take many minutes; do not abort client-side.
  return postReseller<ResellerSelectResult>('/api/select', input, 'select', 0);
}

export interface ResellerPricingRow {
  provider: string;
  region: string;
  category: string;
  canonicalSpec: string;
  rawComputePricePerHr?: number;
  rawStoragePricePerHr?: number;
  rawIpPricePerHr?: number;
  rawTotalPricePerHr: number;
  instanceType?: string;
  currency?: string;
  fetchedAt?: string;
}

export async function listPricing(params: {
  providers?: string;
  provider?: string;
  category?: string;
  canonicalSpec?: string;
  limit?: number;
  nestedVirtualization?: boolean;
}): Promise<{ rows: ResellerPricingRow[]; total: number }> {
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
  return getReseller<{ rows: ResellerPricingRow[]; total: number }>(
    `/api/pricing${suffix}`,
    'pricing'
  );
}

export async function provisionVm(
  input: ResellerProvisionInput
): Promise<ResellerProvisionResult> {
  // Azure VM create (NIC + disk + OS) can exceed 15 minutes — do not abort client-side.
  return postReseller<ResellerProvisionResult>('/api/provision', input, 'provision', 0);
}

export async function terminateVm(
  input: ResellerTerminateInput
): Promise<{ terminated: boolean }> {
  return postReseller<{ terminated: boolean }>('/api/terminate', input, 'terminate', 300_000);
}

export type ResellerPowerAction = 'start' | 'stop' | 'reboot' | 'terminate';

export interface ResellerPowerInput {
  provider: string;
  action: ResellerPowerAction;
  resourceGroup?: string;
  vmName?: string;
  providerInstanceId?: string;
  subscriptionId?: string;
}

export interface ResellerPowerResult {
  provider: string;
  action: string;
  resourceGroup?: string;
  vmName?: string;
  providerInstanceId?: string;
  terminated?: boolean;
}

export async function powerVm(input: ResellerPowerInput): Promise<ResellerPowerResult> {
  return postReseller<ResellerPowerResult>('/api/power', input, 'power', 600_000);
}

export interface AzureProvisionReadyStatus {
  ready: boolean;
  message?: string | null;
  defaultLocation?: string | null;
  homeLocation?: string | null;
  catalogBrowseRegion?: string | null;
  subscriptionId?: string | null;
  networkResourceGroup?: string;
  vnetName?: string | null;
  subnetName?: string | null;
}

export async function getAzureProvisionReady(): Promise<AzureProvisionReadyStatus> {
  return getReseller<AzureProvisionReadyStatus>('/api/azure/provision-ready', 'azure-provision-ready');
}

export interface AzureLocationRow {
  name: string;
  displayName: string;
  regionalDisplayName: string;
}

export interface AzureVmImageValidation {
  valid: boolean;
  message?: string;
  publisher?: string;
  offer?: string;
  sku?: string;
  version?: string;
  label?: string;
  region?: string;
  availableRegions?: string[];
  availableVersions?: string[];
}

export interface AzureMarketplaceImagePlan {
  planId?: string;
  displayName?: string;
  publisher?: string;
  offer?: string;
  sku?: string;
  summary?: string | null;
  version?: string | null;
  versionLabel?: string | null;
}

export interface AzureMarketplaceImageCard {
  id: string;
  displayName: string;
  publisher?: string;
  publisherId?: string;
  offer?: string | null;
  sku?: string | null;
  summary?: string;
  iconUrl?: string | null;
  operatingSystems?: string[];
  productType?: string;
  plans: AzureMarketplaceImagePlan[];
  source?: string;
}

export interface AzureMarketplaceSearchResult {
  rows: AzureMarketplaceImageCard[];
  total: number;
  skip: number;
  take: number;
  source?: string;
}

export async function listAzureSubscriptionLocations(): Promise<AzureLocationRow[]> {
  const data = await getReseller<{ rows: AzureLocationRow[] }>(
    '/api/azure/locations',
    'azure-locations'
  );
  return data.rows ?? [];
}

export async function searchAzureMarketplaceImages(input: {
  query?: string;
  osType?: 'linux' | 'windows';
  skip?: number;
  take?: number;
}): Promise<AzureMarketplaceSearchResult> {
  const qs = new URLSearchParams();
  if (input.query?.trim()) qs.set('q', input.query.trim());
  if (input.osType) qs.set('osType', input.osType);
  if (input.skip != null) qs.set('skip', String(input.skip));
  if (input.take != null) qs.set('take', String(input.take));
  return getReseller<AzureMarketplaceSearchResult>(
    `/api/azure/marketplace/images?${qs.toString()}`,
    'azure-marketplace-images',
    120_000
  );
}

export async function listAzureImageSkuPlans(input: {
  region: string;
  publisher: string;
  offer: string;
  productDisplayName?: string;
}): Promise<AzureMarketplaceImagePlan[]> {
  const qs = new URLSearchParams();
  qs.set('region', input.region.trim());
  qs.set('publisher', input.publisher.trim());
  qs.set('offer', input.offer.trim());
  if (input.productDisplayName?.trim()) {
    qs.set('productDisplayName', input.productDisplayName.trim());
  }
  const data = await getReseller<{ rows: AzureMarketplaceImagePlan[] }>(
    `/api/azure/marketplace/image-plans?${qs.toString()}`,
    'azure-marketplace-image-plans'
  );
  return data.rows ?? [];
}

export async function validateAzureVmImage(input: {
  publisher: string;
  offer: string;
  sku: string;
  region?: string;
  version?: string;
}): Promise<AzureVmImageValidation> {
  return postReseller<AzureVmImageValidation>(
    '/api/azure/validate-image',
    input,
    'azure-validate-image',
    120_000
  );
}

export interface AzureProvisionQuoteValidation {
  valid: boolean;
  message?: string;
  vmSize?: string;
  region?: string;
  canonicalSpec?: string;
  vcpu?: number;
  memoryGb?: number;
  estimatedHourlyUsd?: number | null;
}

export async function validateAzureProvisionQuote(input: {
  vmSize: string;
  region: string;
  vcpu?: number;
  ramGb?: number;
  ssdGb?: number;
  category?: string;
  nestedVirtualization?: boolean;
  assignPublicIp?: boolean;
  imagePublisher?: string;
  imageOffer?: string;
  imageSku?: string;
  customImageId?: string;
}): Promise<AzureProvisionQuoteValidation> {
  return postReseller<AzureProvisionQuoteValidation>(
    '/api/azure/validate-provision-quote',
    input,
    'azure-validate-provision-quote',
    120_000
  );
}

export interface AzureCustomImageRow {
  id: string;
  name: string;
  resourceGroup?: string | null;
  location?: string;
  osType: string;
  label: string;
  source: 'managed' | 'gallery';
  version?: string;
}

export interface AzureCustomImageValidation {
  valid: boolean;
  message?: string;
  id?: string;
  label?: string;
  osType?: string;
  location?: string;
  source?: string;
}

export async function searchAzureCustomImages(
  query = '',
  limit = 50,
  resourceGroup?: string
): Promise<AzureCustomImageRow[]> {
  const qs = new URLSearchParams();
  if (query.trim()) qs.set('q', query.trim());
  if (limit) qs.set('limit', String(limit));
  if (resourceGroup?.trim()) qs.set('resourceGroup', resourceGroup.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await getReseller<{ rows: AzureCustomImageRow[] }>(
    `/api/azure/custom-images${suffix}`,
    'azure-custom-images'
  );
  return data.rows ?? [];
}

export async function validateAzureCustomImage(input: {
  imageId: string;
  region?: string;
}): Promise<AzureCustomImageValidation> {
  return postReseller<AzureCustomImageValidation>(
    '/api/azure/validate-custom-image',
    input,
    'azure-validate-custom-image',
    120_000
  );
}

export interface AzurePlacementOptionRow {
  region: string;
  vmSize: string;
  vcpu: number;
  memoryGb: number;
  estimatedHourlyUsd: number;
  estimatedComputeHourlyUsd?: number;
  estimatedStorageHourlyUsd?: number;
  estimatedIpHourlyUsd?: number;
}

export interface AzurePlacementOptionsResult {
  options: AzurePlacementOptionRow[];
  total: number;
  canonicalSpec: string;
  message?: string;
  homeRegion?: string;
  regionMode?: 'home' | 'auto';
  assignPublicIp?: boolean;
  recommended?: AzurePlacementOptionRow | null;
}

export async function listAzurePlacementOptions(input: {
  vcpu: number;
  ramGb: number;
  ssdGb: number;
  region?: string;
  category?: string;
  nestedVirtualization?: boolean;
  assignPublicIp?: boolean;
  imagePublisher?: string;
  imageOffer?: string;
  imageSku?: string;
}): Promise<AzurePlacementOptionsResult> {
  return postReseller<AzurePlacementOptionsResult>(
    '/api/azure/placement-options',
    input,
    'azure-placement-options',
    300_000
  );
}
