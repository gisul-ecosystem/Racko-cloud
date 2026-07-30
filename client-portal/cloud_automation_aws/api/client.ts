import { cloudAutomationRequest } from '../../lib/cloudAutomationRequest';
import { ApiError } from '../../lib/apiClient';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
} & T;

function awsPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized;
}

async function awsRequest<T>(path: string, options?: RequestInit & { skipAuth?: boolean }): Promise<T> {
  return cloudAutomationRequest<T>('aws', path, options);
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

export interface AwsUsageWindow {
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

export interface AwsPricingEstimatePayload {
  serviceIds: string[];
  region: string;
  accountCount: number;
  durationDays?: number;
  instanceSelections?: Array<{ serviceId: string; instanceType: string }>;
  startDate?: string;
  endDate?: string;
  usageWindows?: AwsUsageWindow[];
  costingMode?: 'shared' | 'per_user';
}

export interface AwsPricingEstimateBreakdown {
  serviceName: string;
  instanceType: string;
  label?: string | null;
  pricingType?: 'instance' | 'flat_rate';
  pricePerHour?: number;
  pricePerDay: number;
  priceUnit?: string;
  unitPrice?: number;
  flatRate?: boolean;
  estimated?: boolean;
  accountCount: number;
  accountMultiplier?: number;
  durationHours?: number;
  durationDays: number;
  cost: number;
}

export interface AwsPricingEstimateResponse {
  success: boolean;
  total: number;
  totalPrice?: number;
  breakdown: AwsPricingEstimateBreakdown[];
  accounts?: number;
  accountCount?: number;
  costingMode?: 'shared' | 'per_user';
  currency?: string;
  durationHours?: number;
  calendarHours?: number;
  billableHours?: number;
  usesUsageWindows?: boolean;
  duration?: number;
  durationDays?: number;
  baseHourlyPrice?: number;
  infraHourlyTotal?: number;
  portalHourlyTotal?: number;
  effectiveHourlyRate?: number;
}

export async function getCategories(): Promise<AwsServiceCategory[]> {
  const response = await awsRequest<ApiResponse<{ categories: AwsServiceCategory[] }>>(
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
  const response = await awsRequest<ApiResponse<{ services: AwsCatalogService[] }>>(
    `${awsPath('/services')}${query ? `?${query}` : ''}`
  );
  return response.services ?? [];
}

export async function getPricing(
  serviceId: string,
  region: string
): Promise<AwsPricingOption[]> {
  const params = new URLSearchParams({ serviceId, region });
  const response = await awsRequest<ApiResponse<{ pricing: AwsPricingOption[] }>>(
    `${awsPath('/pricing')}?${params.toString()}`
  );
  return response.pricing ?? [];
}

export async function getRegions(): Promise<Array<{ code: string; name: string }>> {
  const response = await awsRequest<ApiResponse<{ regions: Array<{ code: string; name: string }> }>>(
    awsPath('/regions')
  );
  return response.regions ?? [];
}

export interface AwsAvailableRegion {
  code: string;
  name: string;
  location: string;
  basePrice?: number;
  currency?: string;
}

export async function getAvailableRegions(
  serviceIds: string[],
  instanceSelections?: string
): Promise<AwsAvailableRegion[]> {
  const params = new URLSearchParams({
    serviceIds: serviceIds.join(','),
  });

  if (instanceSelections) {
    params.set('instanceSelections', instanceSelections);
  }

  const response = await awsRequest<ApiResponse<{ regions: AwsAvailableRegion[] }>>(
    `${awsPath('/available-regions')}?${params.toString()}`
  );

  return response.regions ?? [];
}

export async function calculatePricingEstimate(
  payload: AwsPricingEstimatePayload
): Promise<AwsPricingEstimateResponse> {
  return awsRequest<AwsPricingEstimateResponse>(awsPath('/pricing/estimate'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface AwsCreateRequestPayload {
  projectName?: string;
  project_name?: string;
  idMode?: 'test_ids' | 'aws_ids';
  id_mode?: 'test_ids' | 'aws_ids';
  customerEmail?: string;
  customer_email?: string;
  accountCount?: number;
  account_count?: number;
  costingMode?: 'shared' | 'per_user';
  costing_mode?: 'shared' | 'per_user';
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  enableDailyUsage?: boolean;
  enable_daily_usage?: boolean;
  usageWindows?: AwsUsageWindow[];
  usage_windows?: AwsUsageWindow[];
  timezone?: string;
  enableResourceCleanup?: boolean;
  enable_resource_cleanup?: boolean;
  resourceCleanupTime?: string;
  resource_cleanup_time?: string;
  resourceCleanupTimezone?: string;
  resource_cleanup_timezone?: string;
  resourceCleanupIntervalHours?: number;
  resource_cleanup_interval_hours?: number;
  cleanupEnabled?: boolean;
  cleanupIntervalHours?: number;
  perUserBudgetUsd?: number;
  per_user_budget_usd?: number;
  selectedServices?: Array<{
    serviceId: string;
    serviceName: string;
    instanceType: string | null;
    pricePerDay: number;
    pricingType?: 'instance' | 'flat_rate';
  }>;
  selected_services?: Array<{
    serviceId: string;
    serviceName: string;
    instanceType: string | null;
    pricePerDay: number;
    pricingType?: 'instance' | 'flat_rate';
  }>;
  permissions?: Array<{
    serviceId: string;
    serviceName: string;
    policies: string[];
  }>;
  selectedPermissions?: Record<string, string[]>;
  selected_permissions?: Record<string, string[]>;
  region: string;
  estimatedPrice?: number;
  estimated_price?: number;
}

export interface AwsCreateRequestResponse {
  success: boolean;
  data?: {
    requestId: string;
    estimatedPrice: number;
  };
  requestId?: string;
  estimatedPrice?: number;
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
  labRoles?: Array<{
    userIndex: number;
    roleName: string;
    roleArn: string;
    suspended?: boolean;
    currentSpend?: number;
    budgetExceeded?: boolean;
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
  return awsRequest<AwsCreateRequestResponse>(awsPath('/requests'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface AwsPurchaseClonePayload {
  sourceRequestId: string;
  projectName?: string;
  customerEmail?: string;
  accountCount?: number;
  region?: string;
  costingMode?: 'shared' | 'per_user';
  accessType?: 'magic_link' | 'identity_center';
  usageWindows?: AwsUsageWindow[];
  enableDailyUsage?: boolean;
  resourceCleanupEnabled?: boolean;
  resourceCleanupTime?: string;
  resourceCleanupTimezone?: string;
  resourceCleanupIntervalHours?: number | null;
  perUserBudgetUsd?: number | null;
  timezone?: string;
  selectedServices?: Array<{
    serviceId: string;
    serviceName?: string;
    instanceType?: string | null;
    pricingType?: 'instance' | 'flat_rate';
  }>;
  permissions?: Array<{
    serviceId: string;
    serviceName?: string;
    policies?: string[];
  }>;
}

/** Load prefilled purchase form data from a test_ids purchase email token. */
export async function getPurchaseClonePayload(token: string): Promise<AwsPurchaseClonePayload> {
  const params = new URLSearchParams({ token });
  const response = await awsRequest<{
    success: boolean;
    data: AwsPurchaseClonePayload;
    message?: string;
  }>(`${awsPath('/purchase-intent/clone')}?${params.toString()}`);
  if (!response?.data) {
    throw new ApiError(response?.message || 'Unable to load purchase details from this link.', 404);
  }
  return response.data;
}

/** Record Yes/No response from the purchase intent email. */
export async function respondToPurchaseIntent(
  token: string,
  responseValue: 'yes' | 'no'
): Promise<{ requestId: string; response: string; alreadyHandled?: boolean }> {
  return awsRequest(awsPath('/purchase-intent/respond'), {
    method: 'POST',
    body: JSON.stringify({ token, response: responseValue }),
  });
}

export interface AwsRequest {
  _id: string;
  customer_email?: string;
  customerEmail?: string;
  status: 'Pending' | 'Provisioning' | 'Completed' | 'Failed' | 'Expired' | string;
  estimated_price?: number;
  estimatedPrice?: number;
  account_count?: number;
  accountCount?: number;
  region: string;
  costing_mode?: 'shared' | 'per_user';
  costingMode?: 'shared' | 'per_user';
  selected_services?: Array<{ serviceId: string; instanceType?: string }>;
  selectedServices?: Array<{ serviceId: string; instanceType?: string; serviceName?: string }>;
  created_at?: string;
  createdAt?: string;
  provision_status?: {
    overall: 'idle' | 'running' | 'completed' | 'failed';
  };
}

/** List all provisioning requests for the authenticated user (mirrors Azure listRequests). */
export async function listRequests(): Promise<AwsRequest[]> {
  const response = await awsRequest<{ success: boolean; data: AwsRequest[]; count: number }>(
    awsPath('/requests')
  );
  return response.data ?? [];
}

export async function getRequests(): Promise<AwsRequestRecord[]> {
  const data = await listRequests();
  return data.map((request) => ({
    _id: request._id,
    customerEmail: request.customerEmail ?? request.customer_email ?? '',
    accountCount: request.accountCount ?? request.account_count ?? 0,
    costingMode: request.costingMode ?? request.costing_mode ?? 'shared',
    startDate: '',
    endDate: '',
    region: request.region,
    estimatedPrice: request.estimatedPrice ?? request.estimated_price ?? 0,
    status: request.status,
    selectedServices: (request.selectedServices ?? request.selected_services ?? []).map((s) => ({
      serviceId: String(s.serviceId),
      serviceName: 'serviceName' in s ? String(s.serviceName ?? '') : '',
      instanceType: s.instanceType,
    })),
    createdAt: request.createdAt ?? request.created_at ?? '',
  }));
}

export async function getRequestById(id: string): Promise<AwsRequestRecord> {
  const response = await awsRequest<ApiResponse<{ request: AwsRequestRecord }>>(
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
  return awsRequest(awsPath('/admin/sync-services'), { method: 'POST' });
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
  return awsRequest(awsPath(`/provision/request/${requestId}/start`), { method: 'POST' });
}

export async function getProvisionStatus(requestId: string): Promise<AwsProvisionStatusResponse> {
  return awsRequest<AwsProvisionStatusResponse>(awsPath(`/provision/request/${requestId}/status`));
}

export async function retryProvision(requestId: string): Promise<{ success: boolean; status: string }> {
  return awsRequest(awsPath(`/provision/request/${requestId}/retry`), { method: 'POST' });
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
  const response = await awsRequest<ApiResponse<{ spend: AwsUserSpendRecord[] }>>(
    awsPath(`/requests/${requestId}/spend`)
  );
  return response.spend ?? [];
}

export async function syncRequestSpend(
  requestId: string
): Promise<Array<{ username: string; spendUsd: number; services: AwsUserSpendRecord['services'] }>> {
  const response = await awsRequest<
    ApiResponse<{
      results: Array<{ username: string; spendUsd: number; services: AwsUserSpendRecord['services'] }>;
    }>
  >(awsPath(`/requests/${requestId}/sync-spend`), { method: 'POST' });
  return response.results ?? [];
}

export async function reinstateRequestUser(
  requestId: string,
  userIndex: number
): Promise<{ success: boolean; message: string }> {
  return awsRequest(awsPath(`/requests/${requestId}/users/${userIndex}/reinstate`), {
    method: 'POST',
  });
}

export interface AwsPrivilegedRoleOption {
  key: string;
  name: string;
  description?: string;
  managedPolicyArn?: string;
}

export async function listPrivilegedRoles(): Promise<AwsPrivilegedRoleOption[]> {
  const response = await awsRequest<ApiResponse<{ roles: AwsPrivilegedRoleOption[] }>>(
    awsPath('/privileged-role-requests/roles')
  );
  return response.roles ?? [];
}

export async function createPrivilegedRoleRequest(payload: {
  customerEmail: string;
  awsRole: string;
  requestId?: string;
}): Promise<{ success: boolean; request: unknown }> {
  return awsRequest(awsPath('/privileged-role-requests'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export { awsPath };
