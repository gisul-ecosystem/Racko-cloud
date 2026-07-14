import { ApiError, apiRequest } from '../../lib/apiClient';
import { AWS_ORG_ADMIN_API_PREFIX } from '../constants';
import type {
  AwsCustomIamPolicy,
  AwsCustomIamPolicyAssignment,
  AwsCustomService,
  AwsIamPolicyGroup,
  AwsOrgAdminAccessRequest,
  AwsOrgAdminDailyUsageResponse,
  AwsOrgAdminErrorKind,
  AwsOrgAdminMonitoringResponse,
  AwsOrgAdminCleanupLog,
  AwsOrgAdminRequestDetail,
  AwsOrgAdminRequestSummary,
  AwsOrgAdminLabHistory,
  AwsOrgAdminSharedCost,
  AwsOrgAdminUser,
  AwsOrgAdminUserCost,
} from '../types/orgAdmin';

export class AwsOrgAdminError extends Error {
  readonly status: number;
  readonly kind: AwsOrgAdminErrorKind;

  constructor(message: string, status: number, kind: AwsOrgAdminErrorKind) {
    super(message);
    this.name = 'AwsOrgAdminError';
    this.status = status;
    this.kind = kind;
  }
}

function classifyError(status: number): AwsOrgAdminErrorKind {
  if (status === 401) return 'session_expired';
  return 'unknown';
}

async function orgAdminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await apiRequest<T>(`${AWS_ORG_ADMIN_API_PREFIX}${path}`, options);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new AwsOrgAdminError(err.message, err.status, classifyError(err.status));
    }

    const message =
      err instanceof Error && err.message
        ? `Unable to reach the AWS organization admin service (${err.message}). Check your connection and try again.`
        : 'Unable to reach the AWS organization admin service. Check your connection and try again.';

    throw new AwsOrgAdminError(message, 0, 'network');
  }
}

export async function listAwsOrgRequests(
  params: { status?: string; region?: string; search?: string } = {}
): Promise<AwsOrgAdminRequestSummary[]> {
  const search = new URLSearchParams();
  if (params.status && params.status !== 'All') search.set('status', params.status);
  if (params.region && params.region !== 'All') search.set('region', params.region);
  if (params.search) search.set('search', params.search);
  const query = search.toString();

  const response = await orgAdminRequest<{ success: boolean; requests: AwsOrgAdminRequestSummary[] }>(
    `/requests${query ? `?${query}` : ''}`
  );
  return response.requests ?? [];
}

export async function getAwsOrgRequestDetail(requestId: string): Promise<AwsOrgAdminRequestDetail> {
  const response = await orgAdminRequest<{ success: boolean; detail: AwsOrgAdminRequestDetail }>(
    `/requests/${encodeURIComponent(requestId)}`
  );
  return response.detail;
}

export async function listAwsIamPolicies(): Promise<AwsIamPolicyGroup[]> {
  const response = await orgAdminRequest<{ success: boolean; policies: AwsIamPolicyGroup[] }>(
    '/iam-policies'
  );
  return response.policies ?? [];
}

export async function suspendAwsOrgUser(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/users/${userIndex}/suspend`, {
    method: 'POST',
  });
}

export async function reinstateAwsOrgUser(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/users/${userIndex}/reinstate`, {
    method: 'POST',
  });
}

export async function unblockAwsOrgUser(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/users/${userIndex}/unblock`, {
    method: 'POST',
  });
}

export async function deleteAwsOrgUser(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/users/${userIndex}`, {
    method: 'DELETE',
  });
}

export async function generateAwsOrgConsoleUrl(
  requestId: string,
  userIndex: number
): Promise<{ consoleUrl: string; expiresAt: string }> {
  return orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/console-url`,
    { method: 'POST' }
  );
}

export async function updateAwsOrgUserPermissions(
  requestId: string,
  userIndex: number,
  policies: string[]
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/permissions`,
    {
      method: 'PATCH',
      body: JSON.stringify({ policies }),
    }
  );
}

export async function getAwsOrgUserCost(
  requestId: string,
  userIndex: number
): Promise<AwsOrgAdminUserCost> {
  const response = await orgAdminRequest<{ success: boolean; cost: AwsOrgAdminUserCost }>(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/cost`
  );
  return response.cost;
}

export async function renewAwsOrgUserBudget(
  requestId: string,
  userIndex: number,
  topUpAmount: number
): Promise<{ newTotalBudget: number }> {
  return orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/renew-budget`,
    {
      method: 'POST',
      body: JSON.stringify({ topUpAmount }),
    }
  );
}

export async function triggerAwsOrgUserCleanup(
  requestId: string,
  userIndex: number,
  action: 'delete' | 'pause' = 'delete'
): Promise<{ deletedCount: number }> {
  return orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/cleanup`,
    { method: 'POST', body: JSON.stringify({ action }) }
  );
}

export async function updateAwsOrgCleanupSettings(
  requestId: string,
  userIndex: number,
  settings: { cleanupEnabled?: boolean; cleanupIntervalHours?: number | null }
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/cleanup-settings`,
    {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }
  );
}

export async function updateAwsOrgRequestCleanupSettings(
  requestId: string,
  settings: { cleanupEnabled?: boolean; cleanupIntervalHours?: number; action?: 'delete' | 'pause' }
): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/cleanup-settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function getAwsOrgCleanupLogs(
  requestId: string,
  limit = 50
): Promise<AwsOrgAdminCleanupLog[]> {
  const response = await orgAdminRequest<{ success: boolean; logs: AwsOrgAdminCleanupLog[] }>(
    `/requests/${encodeURIComponent(requestId)}/cleanup-logs?limit=${limit}`
  );
  return response.logs ?? [];
}

export async function syncAwsOrgRequestSpend(requestId: string): Promise<unknown> {
  const response = await orgAdminRequest<{ success: boolean; results: unknown }>(
    `/requests/${encodeURIComponent(requestId)}/sync-spend`,
    { method: 'POST' }
  );
  return response.results;
}

export async function triggerAwsOrgAllCleanup(
  requestId: string,
  action: 'delete' | 'pause' = 'delete'
): Promise<{ deletedCount: number }> {
  return orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/cleanup-all`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export async function getAwsOrgDailyUsage(
  requestId: string
): Promise<AwsOrgAdminDailyUsageResponse> {
  return orgAdminRequest<AwsOrgAdminDailyUsageResponse>(
    `/requests/${encodeURIComponent(requestId)}/daily-usage`
  );
}

export async function getAwsOrgMonitoringLogs(
  requestId: string,
  params: { userIndex?: number; limit?: number } = {}
): Promise<AwsOrgAdminMonitoringResponse> {
  const search = new URLSearchParams();
  if (params.userIndex != null) search.set('userIndex', String(params.userIndex));
  if (params.limit != null) search.set('limit', String(params.limit));
  const query = search.toString();

  return orgAdminRequest<AwsOrgAdminMonitoringResponse>(
    `/requests/${encodeURIComponent(requestId)}/monitoring${query ? `?${query}` : ''}`
  );
}

export async function forceAwsOrgLogout(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/force-logout`,
    { method: 'POST' }
  );
}

export async function listAwsOrgAccessRequests(
  params: { status?: string; requestId?: string } = {}
): Promise<AwsOrgAdminAccessRequest[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.requestId) search.set('requestId', params.requestId);
  const query = search.toString();
  const response = await orgAdminRequest<{
    success: boolean;
    requests: AwsOrgAdminAccessRequest[];
  }>(`/access-requests${query ? `?${query}` : ''}`);
  return response.requests ?? [];
}

export async function reviewAwsOrgAccessRequest(
  id: string,
  payload: { status: 'approved' | 'rejected'; reviewNotes?: string }
): Promise<void> {
  await orgAdminRequest(`/access-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteAwsOrgRequest(requestId: string): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}`, { method: 'DELETE' });
}

export async function fixAwsOrgRequestPermissions(requestId: string): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/fix-permissions`, {
    method: 'POST',
  });
}

export async function getAwsOrgSharedCost(
  requestId: string,
  options: { refresh?: boolean } = {}
): Promise<AwsOrgAdminSharedCost> {
  const query = options.refresh ? '?refresh=true' : '';
  const response = await orgAdminRequest<{
    success: boolean;
    cost?: AwsOrgAdminSharedCost;
    summary?: AwsOrgAdminSharedCost;
  }>(`/requests/${encodeURIComponent(requestId)}/shared-cost${query}`);
  return response.cost ?? response.summary ?? {
    requestId,
    monthToDateCost: 0,
  };
}

export async function getAwsOrgLabHistory(
  requestId: string,
  params: { userIndex?: number; limit?: number } = {}
): Promise<AwsOrgAdminLabHistory> {
  const search = new URLSearchParams();
  if (params.userIndex != null) search.set('userIndex', String(params.userIndex));
  if (params.limit != null) search.set('limit', String(params.limit));
  const query = search.toString();
  const response = await orgAdminRequest<{
    success: boolean;
    history?: AwsOrgAdminLabHistory;
    entries?: AwsOrgAdminLabHistory['entries'];
  }>(`/requests/${encodeURIComponent(requestId)}/history${query ? `?${query}` : ''}`);
  return response.history ?? { requestId, entries: response.entries ?? [] };
}

export async function listAwsCustomIamPolicies(): Promise<AwsCustomIamPolicy[]> {
  const response = await orgAdminRequest<{ success: boolean; policies: AwsCustomIamPolicy[] }>(
    '/custom-iam-policies'
  );
  return response.policies ?? [];
}

export async function createAwsCustomIamPolicy(
  body: Omit<AwsCustomIamPolicy, 'id'>
): Promise<AwsCustomIamPolicy> {
  const response = await orgAdminRequest<{ success: boolean; policy: AwsCustomIamPolicy }>(
    '/custom-iam-policies',
    { method: 'POST', body: JSON.stringify(body) }
  );
  return response.policy;
}

export async function updateAwsCustomIamPolicy(
  id: string,
  body: Partial<Omit<AwsCustomIamPolicy, 'id'>>
): Promise<AwsCustomIamPolicy> {
  const response = await orgAdminRequest<{ success: boolean; policy: AwsCustomIamPolicy }>(
    `/custom-iam-policies/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  return response.policy;
}

export async function deleteAwsCustomIamPolicy(id: string): Promise<void> {
  await orgAdminRequest(`/custom-iam-policies/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listAwsCustomServices(): Promise<AwsCustomService[]> {
  const response = await orgAdminRequest<{ success: boolean; services: AwsCustomService[] }>(
    '/custom-services'
  );
  return response.services ?? [];
}

export async function createAwsCustomService(
  body: Omit<AwsCustomService, 'id'>
): Promise<AwsCustomService> {
  const response = await orgAdminRequest<{ success: boolean; service: AwsCustomService }>(
    '/custom-services',
    { method: 'POST', body: JSON.stringify(body) }
  );
  return response.service;
}

export async function updateAwsCustomService(
  id: string,
  body: Partial<Omit<AwsCustomService, 'id'>>
): Promise<AwsCustomService> {
  const response = await orgAdminRequest<{ success: boolean; service: AwsCustomService }>(
    `/custom-services/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  return response.service;
}

export async function deleteAwsCustomService(id: string): Promise<void> {
  await orgAdminRequest(`/custom-services/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listAwsRequestCustomServices(requestId: string): Promise<AwsCustomService[]> {
  const response = await orgAdminRequest<{ success: boolean; services: AwsCustomService[] }>(
    `/requests/${encodeURIComponent(requestId)}/custom-services`
  );
  return response.services ?? [];
}

export async function addAwsCustomServiceToRequest(
  requestId: string,
  serviceId: string
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/custom-services/${encodeURIComponent(serviceId)}`,
    { method: 'POST' }
  );
}

export async function removeAwsCustomServiceFromRequest(
  requestId: string,
  serviceId: string
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/custom-services/${encodeURIComponent(serviceId)}`,
    { method: 'DELETE' }
  );
}

export async function listAwsCustomIamAssignments(
  requestId: string
): Promise<AwsCustomIamPolicyAssignment[]> {
  const response = await orgAdminRequest<{
    success: boolean;
    assignments: AwsCustomIamPolicyAssignment[];
  }>(`/requests/${encodeURIComponent(requestId)}/custom-iam-policy-assignments`);
  return response.assignments ?? [];
}

export async function assignAwsCustomIamPolicy(
  requestId: string,
  userIndex: number,
  policyId: string
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/custom-iam-policies`,
    { method: 'POST', body: JSON.stringify({ policyId }) }
  );
}

export async function assignAwsCustomIamPolicyToAll(
  requestId: string,
  policyId: string
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/custom-iam-policies/assign-all`,
    { method: 'POST', body: JSON.stringify({ policyId }) }
  );
}

export async function revokeAwsCustomIamAssignment(assignmentId: string): Promise<void> {
  await orgAdminRequest(
    `/custom-iam-policy-assignments/${encodeURIComponent(assignmentId)}`,
    { method: 'DELETE' }
  );
}

export function formatMinutes(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const minutes = Math.max(0, Math.round(value));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}
