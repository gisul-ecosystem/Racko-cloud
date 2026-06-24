import { apiRequest } from '../../lib/apiClient';
import { AWS_API_BASE } from '../constants';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
} & T;

function awsPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${AWS_API_BASE}${normalized}`;
}

export interface AwsServiceCategory {
  _id: string;
  name: string;
  description: string;
  icon: string;
}

export interface AwsCatalogService {
  _id: string;
  name: string;
  description: string;
  awsServiceCode: string;
  pricingType: 'instance' | 'flat_rate';
  regions: string[];
  categoryId: AwsServiceCategory | string;
}

export interface AwsPricingOption {
  instanceType: string;
  pricePerHour: number;
  pricePerDay: number;
  priceUnit: string;
  unitPrice: number;
  flatRate: boolean;
}

export interface AwsPricingEstimatePayload {
  serviceIds: string[];
  region: string;
  accountCount: number;
  durationDays: number;
  instanceSelections?: Array<{ serviceId: string; instanceType: string }>;
}

export interface AwsPricingEstimateBreakdown {
  serviceName: string;
  instanceType: string;
  pricePerDay: number;
  priceUnit?: string;
  unitPrice?: number;
  flatRate?: boolean;
  accountCount: number;
  durationDays: number;
  cost: number;
}

export interface AwsPricingEstimateResponse {
  success: boolean;
  total: number;
  breakdown: AwsPricingEstimateBreakdown[];
}

export async function getCategories(): Promise<AwsServiceCategory[]> {
  const response = await apiRequest<ApiResponse<{ categories: AwsServiceCategory[] }>>(
    awsPath('/categories')
  );
  return response.categories ?? [];
}

export async function getServices(params?: {
  category?: string;
  region?: string;
}): Promise<AwsCatalogService[]> {
  const search = new URLSearchParams();
  if (params?.category) search.set('category', params.category);
  if (params?.region) search.set('region', params.region);

  const query = search.toString();
  const response = await apiRequest<ApiResponse<{ services: AwsCatalogService[] }>>(
    `${awsPath('/services')}${query ? `?${query}` : ''}`
  );
  return response.services ?? [];
}

export async function getPricing(
  serviceId: string,
  region: string
): Promise<AwsPricingOption[]> {
  const params = new URLSearchParams({ serviceId, region });
  const response = await apiRequest<ApiResponse<{ pricing: AwsPricingOption[] }>>(
    `${awsPath('/pricing')}?${params.toString()}`
  );
  return response.pricing ?? [];
}

export async function getRegions(): Promise<Array<{ code: string; name: string }>> {
  const response = await apiRequest<ApiResponse<{ regions: Array<{ code: string; name: string }> }>>(
    awsPath('/regions')
  );
  return response.regions ?? [];
}

export async function calculatePricingEstimate(
  payload: AwsPricingEstimatePayload
): Promise<AwsPricingEstimateResponse> {
  return apiRequest<AwsPricingEstimateResponse>(awsPath('/pricing/estimate'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface AwsCreateRequestPayload {
  customerEmail: string;
  accountCount: number;
  costingMode: 'shared' | 'per_user';
  startDate: string;
  endDate: string;
  enableDailyUsage: boolean;
  usageWindows: Array<{ day: string; startTime: string; endTime: string }>;
  timezone: string;
  cleanupEnabled: boolean;
  cleanupIntervalHours?: number;
  perUserBudgetUsd?: number;
  selectedServices: Array<{
    serviceId: string;
    serviceName: string;
    instanceType: string | null;
    pricePerDay: number;
  }>;
  permissions: Array<{
    serviceId: string;
    serviceName: string;
    policies: string[];
  }>;
  region: string;
  estimatedPrice: number;
}

export interface AwsCreateRequestResponse {
  success: boolean;
  requestId: string;
  estimatedPrice: number;
}

export interface AwsRequestRecord {
  _id: string;
  customerEmail: string;
  accountCount: number;
  costingMode: string;
  startDate: string;
  endDate: string;
  region: string;
  estimatedPrice: number;
  perUserBudgetUsd?: number;
  status: string;
  identityUsers?: Array<{
    userId: string;
    username: string;
    email?: string;
    needsActivation?: boolean;
    budgetExceeded?: boolean;
    suspended?: boolean;
    currentSpend?: number;
  }>;
  selectedServices: Array<{
    serviceId: string;
    serviceName: string;
    instanceType?: string;
    pricePerDay?: number;
  }>;
  createdAt: string;
}

export async function createRequest(
  payload: AwsCreateRequestPayload
): Promise<AwsCreateRequestResponse> {
  return apiRequest<AwsCreateRequestResponse>(awsPath('/requests'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getRequests(): Promise<AwsRequestRecord[]> {
  const response = await apiRequest<ApiResponse<{ requests: AwsRequestRecord[] }>>(
    awsPath('/requests')
  );
  return response.requests ?? [];
}

export async function getRequestById(id: string): Promise<AwsRequestRecord> {
  const response = await apiRequest<ApiResponse<{ request: AwsRequestRecord }>>(
    awsPath(`/requests/${id}`)
  );
  if (!response.request) {
    throw new Error('Request not found');
  }
  return response.request;
}

export async function syncServicesCatalog(): Promise<{
  success: boolean;
  synced: number;
  skipped: number;
  errors: number;
  duration: number;
}> {
  return apiRequest(awsPath('/admin/sync-services'), { method: 'POST' });
}

export interface AwsProvisionStatusResponse {
  success: boolean;
  status: string;
  currentStep: number;
  progress: number;
  message: string;
  steps: Array<{
    key: string;
    label: string;
    step: number;
    state: 'pending' | 'in_progress' | 'completed' | 'failed';
  }>;
  awsAccountId?: string | null;
  awsAccountIds?: string[];
  perUserAccess?: boolean;
  costingMode?: 'shared' | 'per_user';
  credentialsSent?: boolean;
  failureReason?: string | null;
  logs?: Array<{
    step: number;
    stepName?: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    error?: string | null;
  }>;
}

export async function startProvision(requestId: string): Promise<{ success: boolean; status: string }> {
  return apiRequest(awsPath(`/provision/request/${requestId}/start`), { method: 'POST' });
}

export async function getProvisionStatus(requestId: string): Promise<AwsProvisionStatusResponse> {
  return apiRequest<AwsProvisionStatusResponse>(awsPath(`/provision/request/${requestId}/status`));
}

export async function retryProvision(requestId: string): Promise<{ success: boolean; status: string }> {
  return apiRequest(awsPath(`/provision/request/${requestId}/retry`), { method: 'POST' });
}

export interface AwsUserSpendRecord {
  username: string;
  userId: string;
  spendUsd: number;
  services: Array<{ serviceName: string; spendUsd: number }>;
  budgetExceeded: boolean;
  suspended: boolean;
  syncedAt?: string | null;
}

export async function getRequestSpend(requestId: string): Promise<AwsUserSpendRecord[]> {
  const response = await apiRequest<ApiResponse<{ spend: AwsUserSpendRecord[] }>>(
    awsPath(`/requests/${requestId}/spend`)
  );
  return response.spend ?? [];
}

export async function syncRequestSpend(
  requestId: string
): Promise<Array<{ username: string; spendUsd: number; services: AwsUserSpendRecord['services'] }>> {
  const response = await apiRequest<
    ApiResponse<{
      results: Array<{ username: string; spendUsd: number; services: AwsUserSpendRecord['services'] }>;
    }>
  >(awsPath(`/requests/${requestId}/sync-spend`), { method: 'POST' });
  return response.results ?? [];
}

export async function reinstateRequestUser(
  requestId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest(awsPath(`/requests/${requestId}/users/${userId}/reinstate`), {
    method: 'POST',
  });
}

export { awsPath };
