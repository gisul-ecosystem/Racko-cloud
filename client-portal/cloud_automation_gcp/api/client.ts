import { cloudAutomationRequest } from '../../lib/cloudAutomationRequest';
import { ApiError } from '../../lib/apiClient';

type ApiResponse<T> = { success: boolean; message?: string } & T;

function gcpPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

async function gcpRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return cloudAutomationRequest<T>('gcp', gcpPath(path), options);
}

export interface GcpServiceCategory {
  _id: string;
  name: string;
  description: string;
  icon: string;
}

export interface GcpCatalogService {
  _id: string;
  name: string;
  description: string;
  gcpServiceCode: string;
  pricingType: 'instance' | 'flat_rate';
  regions: string[];
  categoryId: GcpServiceCategory | string;
}

export interface GcpPricingOption {
  instanceType: string;
  pricePerHour: number;
  pricePerDay: number;
  priceUnit: string;
  unitPrice: number;
  flatRate: boolean;
  label?: string;
}

export interface GcpUsageWindow {
  dayOfWeek?: number;
  day_of_week?: number;
  windowStartTime?: string;
  window_start_time?: string;
  windowEndTime?: string;
  window_end_time?: string;
  timezone?: string;
  dailyLimitHours?: number;
  daily_limit_hours?: number | null;
}

export interface GcpPricingEstimatePayload {
  serviceIds: string[];
  region: string;
  accountCount: number;
  durationDays?: number;
  instanceSelections?: Array<{ serviceId: string; instanceType: string }>;
  startDate?: string;
  endDate?: string;
  usageWindows?: GcpUsageWindow[];
  costingMode?: 'shared' | 'per_user';
}

export interface GcpCreateRequestPayload {
  projectName?: string;
  project_name?: string;
  projectId?: string;
  project_id?: string;
  idMode?: 'test_ids' | 'gcp_ids';
  id_mode?: 'test_ids' | 'gcp_ids';
  customerEmail?: string;
  customer_email?: string;
  accountCount?: number;
  account_count?: number;
  costingMode?: 'shared' | 'per_user';
  costing_mode?: 'shared' | 'per_user';
  accessType?: 'magic_link' | 'cloud_identity';
  access_type?: 'magic_link' | 'cloud_identity';
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  enableDailyUsage?: boolean;
  enable_daily_usage?: boolean;
  usageWindows?: GcpUsageWindow[];
  usage_windows?: GcpUsageWindow[];
  timezone?: string;
  enableResourceCleanup?: boolean;
  enable_resource_cleanup?: boolean;
  resourceCleanupTime?: string;
  resource_cleanup_time?: string;
  resourceCleanupTimezone?: string;
  resource_cleanup_timezone?: string;
  resourceCleanupIntervalHours?: number;
  resource_cleanup_interval_hours?: number;
  resourceCleanupAction?: 'delete' | 'pause';
  perUserBudgetUsd?: number;
  per_user_budget_usd?: number;
  selectedServices?: Array<{
    serviceId: string;
    serviceName: string;
    instanceType: string | null;
    pricePerDay: number;
    pricingType?: 'instance' | 'flat_rate';
  }>;
  permissions?: Array<{
    serviceId: string;
    serviceName: string;
    policies?: string[];
    roles?: string[];
  }>;
  region: string;
  estimatedPrice?: number;
}

export interface GcpRequest {
  _id: string;
  customerEmail?: string;
  customer_email?: string;
  projectName?: string;
  project_name?: string;
  accountCount?: number;
  account_count?: number;
  region?: string;
  status?: string;
  estimatedPrice?: number;
  estimated_price?: number;
  createdAt?: string;
  startDate?: string;
  endDate?: string;
}

export interface GcpProvisionStatus {
  status: string;
  progress: number;
  message: string;
  failureReason?: string | null;
  gcpProjectId?: string | null;
  steps?: Array<{ key: string; label: string; status: string }>;
}

export async function getCategories(): Promise<GcpServiceCategory[]> {
  const res = await gcpRequest<ApiResponse<{ categories: GcpServiceCategory[] }>>('/categories');
  return res.categories ?? [];
}

export async function getServices(params?: {
  category?: string;
  region?: string;
}): Promise<GcpCatalogService[]> {
  const search = new URLSearchParams();
  if (params?.category) search.set('category', params.category);
  if (params?.region) search.set('region', params.region);
  const query = search.toString();
  const res = await gcpRequest<ApiResponse<{ services: GcpCatalogService[] }>>(
    `/services${query ? `?${query}` : ''}`
  );
  return res.services ?? [];
}

export async function getPricing(serviceId: string, region: string): Promise<GcpPricingOption[]> {
  const params = new URLSearchParams({ serviceId, region });
  const res = await gcpRequest<ApiResponse<{ pricing: GcpPricingOption[] }>>(
    `/pricing?${params.toString()}`
  );
  return res.pricing ?? [];
}

export async function getRegions(): Promise<Array<{ code: string; name: string }>> {
  const res = await gcpRequest<ApiResponse<{ regions: Array<{ code: string; name: string }> }>>(
    '/regions'
  );
  return res.regions ?? [];
}

export async function getAvailableRegions(
  serviceIds: string[],
  instanceSelections?: string
): Promise<Array<{ code: string; name: string; basePrice?: number }>> {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(',') });
  if (instanceSelections) params.set('instanceSelections', instanceSelections);
  const res = await gcpRequest<ApiResponse<{ regions: Array<{ code: string; name: string; basePrice?: number }> }>>(
    `/available-regions?${params.toString()}`
  );
  return res.regions ?? [];
}

export async function calculatePricingEstimate(payload: GcpPricingEstimatePayload) {
  return gcpRequest('/pricing/estimate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createRequest(payload: GcpCreateRequestPayload) {
  return gcpRequest<{ success: boolean; requestId: string; estimatedPrice?: number }>('/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listRequests(): Promise<GcpRequest[]> {
  const res = await gcpRequest<ApiResponse<{ data: GcpRequest[] }>>('/requests');
  return res.data ?? [];
}

export async function getRequest(id: string): Promise<GcpRequest> {
  const res = await gcpRequest<ApiResponse<{ request: GcpRequest }>>(`/requests/${id}`);
  return res.request;
}

export async function startProvision(requestId: string) {
  return gcpRequest(`/provision/request/${requestId}/start`, { method: 'POST' });
}

export async function getProvisionStatus(requestId: string): Promise<GcpProvisionStatus> {
  return gcpRequest<GcpProvisionStatus>(`/provision/request/${requestId}/status`);
}

/** Phase 2 — purchase intent clone from email token. */
export async function getPurchaseClonePayload(_token: string) {
  throw new ApiError('GCP purchase intent is not enabled yet.', 501);
}

/** Phase 2 — privileged role catalog. */
export async function listPrivilegedRoles(): Promise<Array<{ _id: string; name: string }>> {
  return [];
}

/** Phase 2 — request elevated privileged roles. */
export async function createPrivilegedRoleRequest(_payload: Record<string, unknown>) {
  throw new ApiError('GCP privileged role requests are not enabled yet.', 501);
}
