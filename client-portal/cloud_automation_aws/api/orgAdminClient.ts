import { ApiError, apiRequest } from '../../lib/apiClient';
import { AWS_ORG_ADMIN_API_PREFIX } from '../constants';
import type {
  AwsIamPolicyGroup,
  AwsOrgAdminDailyUsageResponse,
  AwsOrgAdminErrorKind,
  AwsOrgAdminMonitoringResponse,
  AwsOrgAdminRequestDetail,
  AwsOrgAdminRequestSummary,
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
  userIndex: number
): Promise<{ deletedCount: number }> {
  return orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/cleanup`,
    { method: 'POST' }
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

export async function syncAwsOrgRequestSpend(requestId: string): Promise<unknown> {
  const response = await orgAdminRequest<{ success: boolean; results: unknown }>(
    `/requests/${encodeURIComponent(requestId)}/sync-spend`,
    { method: 'POST' }
  );
  return response.results;
}

export async function triggerAwsOrgAllCleanup(requestId: string): Promise<{ deletedCount: number }> {
  return orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/cleanup-all`, {
    method: 'POST',
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
