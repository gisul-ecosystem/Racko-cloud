import { ApiError, apiRequest } from '../../lib/apiClient';
import { ORG_ADMIN_API_PREFIX } from '../constants';
import type {
  OrgAdminAccessRequest,
  OrgAdminAzureRoleOption,
  OrgAdminAzureRolesResponse,
  OrgAdminDailyUsageResponse,
  OrgAdminErrorKind,
  OrgAdminMonitoringResponse,
  OrgAdminRequestSummary,
  OrgAdminResourceGroup,
  OrgAdminResourceGroupDetailResponse,
  OrgAdminUser,
  OrgAdminUserAzureCostResponse,
} from '../types/orgAdmin';

export class OrgAdminError extends Error {
  readonly status: number;
  readonly kind: OrgAdminErrorKind;

  constructor(message: string, status: number, kind: OrgAdminErrorKind) {
    super(message);
    this.name = 'OrgAdminError';
    this.status = status;
    this.kind = kind;
  }
}

function classifyError(status: number, message: string): OrgAdminErrorKind {
  const lower = message.toLowerCase();

  if (status === 401) {
    if (lower.includes('credential')) return 'invalid_credentials';
    return 'session_expired';
  }

  return 'unknown';
}

async function orgAdminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await apiRequest<T>(`${ORG_ADMIN_API_PREFIX}${path}`, options);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new OrgAdminError(err.message, err.status, classifyError(err.status, err.message));
    }

    throw new OrgAdminError(
      'Unable to reach the organization admin service. Check your connection and try again.',
      0,
      'network'
    );
  }
}

export async function listOrgResourceGroups(): Promise<OrgAdminResourceGroup[]> {
  const response = await orgAdminRequest<{ success: boolean; resourceGroups: OrgAdminResourceGroup[] }>(
    '/resource-groups'
  );
  return response.resourceGroups ?? [];
}

export async function listOrgRequests(): Promise<OrgAdminRequestSummary[]> {
  const response = await orgAdminRequest<{
    success: boolean;
    data: OrgAdminRequestSummary[];
  }>('/requests');
  return response.data ?? [];
}

export async function getOrgResourceGroupDetail(
  requestId: number
): Promise<OrgAdminResourceGroupDetailResponse> {
  return orgAdminRequest<OrgAdminResourceGroupDetailResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}`
  );
}

export async function getOrgMonitoringLogs(
  requestId: number,
  params: { userId?: number; limit?: number } = {}
): Promise<OrgAdminMonitoringResponse> {
  const search = new URLSearchParams();
  if (params.userId != null) search.set('userId', String(params.userId));
  if (params.limit != null) search.set('limit', String(params.limit));
  const query = search.toString();

  return orgAdminRequest<OrgAdminMonitoringResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}/monitoring${query ? `?${query}` : ''}`
  );
}

export async function deleteOrgAdminUser(
  requestId: number,
  userId: number
): Promise<{ success: boolean; user: OrgAdminUser }> {
  return orgAdminRequest(`/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function updateOrgAdminUserRoles(
  requestId: number,
  userId: number,
  roles: string[]
): Promise<{ success: boolean; user: OrgAdminUser }> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/roles`,
    {
      method: 'PATCH',
      body: JSON.stringify({ roles }),
    }
  );
}

export async function forceOrgAdminLogout(
  requestId: number,
  userId: number
): Promise<{ success: boolean }> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/force-logout`,
    {
      method: 'POST',
    }
  );
}

export async function getOrgUserAzureCost(
  requestId: number,
  userId: number
): Promise<OrgAdminUserAzureCostResponse> {
  return orgAdminRequest<OrgAdminUserAzureCostResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/azure-cost`
  );
}

export async function getOrgDailyUsage(requestId: number): Promise<OrgAdminDailyUsageResponse> {
  return orgAdminRequest<OrgAdminDailyUsageResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}/daily-usage`
  );
}

export async function listOrgAzureRoles(): Promise<OrgAdminAzureRoleOption[]> {
  const response = await orgAdminRequest<OrgAdminAzureRolesResponse>('/azure/roles');
  return response.data ?? [];
}

export async function listOrgAccessRequests(
  params: { status?: string; requestId?: number } = {}
): Promise<OrgAdminAccessRequest[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.requestId != null) search.set('requestId', String(params.requestId));
  const query = search.toString();

  const response = await orgAdminRequest<{ success: boolean; requests: OrgAdminAccessRequest[] }>(
    `/access-requests${query ? `?${query}` : ''}`
  );
  return response.requests ?? [];
}

export async function reviewOrgAccessRequest(
  id: number,
  payload: { status: 'approved' | 'rejected'; reviewNotes?: string }
): Promise<{ success: boolean; request: OrgAdminAccessRequest }> {
  return orgAdminRequest(`/access-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function renewOrgAdminUserBudget(
  requestId: number,
  userId: number,
  topUpAmount: number
): Promise<{ success: boolean; newTotalBudget: number }> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/renew-budget`,
    {
      method: 'POST',
      body: JSON.stringify({ topUpAmount }),
    }
  );
}

export async function updateOrgAdminCleanupSettings(
  requestId: number,
  userId: number,
  payload: { cleanupDisabled?: boolean; cleanupIntervalOverride?: number | null }
): Promise<{ success: boolean }> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/cleanup-settings`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function triggerOrgAdminCleanup(
  requestId: number,
  userId: number
): Promise<{ success: boolean; deletedCount: number }> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/trigger-cleanup`,
    { method: 'POST' }
  );
}

export function parseRolesInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\n,]+/)
        .map((role) => role.trim())
        .filter(Boolean)
    )
  );
}

export function formatRolesForInput(roles: { role: string }[]): string {
  return roles.map((entry) => entry.role).join('\n');
}
