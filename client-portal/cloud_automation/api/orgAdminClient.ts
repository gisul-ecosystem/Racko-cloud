import { ApiError, apiRequest } from '../../lib/apiClient';
import { directGatewayRequest } from '../../lib/directGatewayRequest';
import { ORG_ADMIN_API_PREFIX } from '../constants';
import type {
  OrgAdminAccessRequest,
  OrgAdminAzureRoleOption,
  OrgAdminDeleteRequestResult,
  OrgAdminAzureRolesResponse,
  OrgAdminCustomRoleAssignment,
  OrgAdminBulkCustomRoleAssignmentResult,
  OrgAdminCustomRoleDefinition,
  OrgAdminCustomService,
  OrgAdminDailyUsageResponse,
  OrgAdminErrorKind,
  OrgAdminMonitoringResponse,
  OrgAdminRequestSummary,
  OrgAdminResourceGroup,
  OrgAdminResourceGroupDetailResponse,
  OrgAdminUser,
  OrgAdminUserAzureCostResponse,
  OrgAdminSharedAzureCostSummary,
  OrgAdminSharedAzureCostResponse,
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
  const fullPath = `${ORG_ADMIN_API_PREFIX}${path}`;

  try {
    if (typeof window !== 'undefined') {
      return await directGatewayRequest<T>(fullPath, options);
    }

    return await apiRequest<T>(fullPath, options);
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

export async function deleteOrgAdminRequest(
  requestId: number
): Promise<OrgAdminDeleteRequestResult> {
  return orgAdminRequest<OrgAdminDeleteRequestResult>(
    `/resource-groups/${encodeURIComponent(requestId)}`,
    { method: 'DELETE' }
  );
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
): Promise<{
  success: boolean;
  data?: {
    message?: string;
    sessionsClosedCount?: number;
    blockedUntil?: string;
    azureRevoke?: { accountDisabled?: boolean };
  };
}> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/force-logout`,
    {
      method: 'POST',
    }
  );
}

export async function getOrgUserAzureCost(
  requestId: number,
  userId: number,
  options: { refresh?: boolean } = {}
): Promise<OrgAdminUserAzureCostResponse> {
  const params = options.refresh ? '?refresh=true' : '';
  return orgAdminRequest<OrgAdminUserAzureCostResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/azure-cost${params}`
  );
}

export async function getOrgSharedAzureCost(
  requestId: number,
  options: { refresh?: boolean } = {}
): Promise<OrgAdminSharedAzureCostResponse> {
  const params = options.refresh ? '?refresh=true' : '';
  return orgAdminRequest<OrgAdminSharedAzureCostResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}/shared-azure-cost${params}`
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
): Promise<{
  success: boolean;
  action: 'delete' | 'pause';
  affectedCount: number;
  deletedCount: number;
  pausedCount: number;
}> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/trigger-cleanup`,
    { method: 'POST' }
  );
}

export async function triggerOrgRequestCleanup(
  requestId: number
): Promise<{
  success: boolean;
  action: 'delete' | 'pause';
  affectedCount: number;
  deletedCount: number;
  totalDeleted: number;
}> {
  return orgAdminRequest(`/resource-groups/${encodeURIComponent(requestId)}/cleanup`, {
    method: 'POST',
  });
}

export async function unblockOrgAdminUser(
  requestId: number,
  userId: number,
  options: { resetUsage?: boolean; pauseWindowEnforcement?: boolean; pauseWindowHours?: number } = {}
): Promise<{
  success: boolean;
  userId: number;
  username: string;
  windowEnforcementPausedUntil?: string | null;
  temporaryPassword?: string;
  userPrincipalName?: string | null;
}> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/unblock`,
    {
      method: 'POST',
      body: JSON.stringify(options),
    }
  );
}

export async function getOrgUserSessions(
  requestId: number,
  userId: number
): Promise<{ success: boolean; sessions: import('../types/orgAdmin').OrgAdminUserSession[] }> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/sessions`
  );
}

export async function getOrgUserLiveResources(
  requestId: number,
  userId: number
): Promise<{
  success: boolean;
  liveResources: import('../types/orgAdmin').OrgAdminLiveAzureResource[];
  liveResourceCount: number;
  peakResourceCount?: number;
}> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/live-resources`
  );
}

export async function getOrgCleanupLogs(
  requestId: number
): Promise<{ success: boolean; logs: import('../types/orgAdmin').OrgAdminCleanupLog[] }> {
  return orgAdminRequest(`/resource-groups/${encodeURIComponent(requestId)}/cleanup-logs`);
}

export async function getOrgLabHistory(
  requestId: number,
  options?: { userId?: number; limit?: number }
): Promise<{ success: boolean; history: import('../types/orgAdmin').OrgAdminLabHistory }> {
  const params = new URLSearchParams();
  if (options?.userId) {
    params.set('userId', String(options.userId));
  }
  if (options?.limit) {
    params.set('limit', String(options.limit));
  }
  const query = params.toString();
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/history${query ? `?${query}` : ''}`
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

export async function listOrgCustomRoles(): Promise<OrgAdminCustomRoleDefinition[]> {
  const response = await orgAdminRequest<{ success: boolean; roles: OrgAdminCustomRoleDefinition[] }>(
    '/custom-roles'
  );
  return response.roles ?? [];
}

export async function createOrgCustomRole(body: {
  name: string;
  description?: string;
  permissions: string[];
}): Promise<OrgAdminCustomRoleDefinition> {
  const response = await orgAdminRequest<{ success: boolean; role: OrgAdminCustomRoleDefinition }>(
    '/custom-roles',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
  return response.role;
}

export async function updateOrgCustomRole(
  id: number,
  body: { name?: string; description?: string; permissions?: string[] }
): Promise<OrgAdminCustomRoleDefinition> {
  const response = await orgAdminRequest<{ success: boolean; role: OrgAdminCustomRoleDefinition }>(
    `/custom-roles/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    }
  );
  return response.role;
}

export async function deleteOrgCustomRole(id: number): Promise<void> {
  await orgAdminRequest(`/custom-roles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function listOrgCustomRoleAssignments(
  requestId: number
): Promise<OrgAdminCustomRoleAssignment[]> {
  const response = await orgAdminRequest<{
    success: boolean;
    assignments: OrgAdminCustomRoleAssignment[];
  }>(`/resource-groups/${encodeURIComponent(requestId)}/custom-role-assignments`);
  return response.assignments ?? [];
}

export async function assignOrgCustomRole(
  requestId: number,
  azureUserId: string,
  body: {
    customRoleDefId?: number | null;
    permissions?: string[] | null;
    resourceGroupName: string;
    username: string;
  }
): Promise<OrgAdminCustomRoleAssignment> {
  const response = await orgAdminRequest<{
    success: boolean;
    assignment: OrgAdminCustomRoleAssignment;
  }>(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(azureUserId)}/assign-custom-role`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
  return response.assignment;
}

export async function assignOrgCustomRoleToAllUsers(
  requestId: number,
  body: {
    customRoleDefId?: number | null;
    permissions?: string[] | null;
    skipExisting?: boolean;
  }
): Promise<OrgAdminBulkCustomRoleAssignmentResult> {
  return orgAdminRequest<OrgAdminBulkCustomRoleAssignmentResult>(
    `/resource-groups/${encodeURIComponent(requestId)}/assign-custom-role-to-all`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}

export async function revokeOrgCustomRoleAssignment(assignmentId: number): Promise<void> {
  await orgAdminRequest(`/custom-role-assignments/${encodeURIComponent(assignmentId)}`, {
    method: 'DELETE',
  });
}

export async function listOrgCustomServices(): Promise<OrgAdminCustomService[]> {
  const response = await orgAdminRequest<{ success: boolean; services: OrgAdminCustomService[] }>(
    '/custom-services'
  );
  return response.services ?? [];
}

export async function createOrgCustomService(body: {
  name: string;
  description?: string;
  category?: string;
  pricePerUser?: number;
  icon?: string;
}): Promise<OrgAdminCustomService> {
  const response = await orgAdminRequest<{ success: boolean; service: OrgAdminCustomService }>(
    '/custom-services',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
  return response.service;
}

export async function updateOrgCustomService(
  id: number,
  body: Partial<{
    name: string;
    description: string;
    category: string;
    pricePerUser: number;
    icon: string;
  }>
): Promise<OrgAdminCustomService> {
  const response = await orgAdminRequest<{ success: boolean; service: OrgAdminCustomService }>(
    `/custom-services/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    }
  );
  return response.service;
}

export async function deleteOrgCustomService(id: number): Promise<void> {
  await orgAdminRequest(`/custom-services/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function listOrgRequestCustomServices(
  requestId: number
): Promise<OrgAdminCustomService[]> {
  const response = await orgAdminRequest<{ success: boolean; services: OrgAdminCustomService[] }>(
    `/resource-groups/${encodeURIComponent(requestId)}/custom-services`
  );
  return response.services ?? [];
}

export async function addOrgCustomServiceToRequest(
  requestId: number,
  serviceId: number
): Promise<void> {
  await orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/custom-services/${encodeURIComponent(serviceId)}`,
    { method: 'POST' }
  );
}

export async function removeOrgCustomServiceFromRequest(
  requestId: number,
  serviceId: number
): Promise<void> {
  await orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/custom-services/${encodeURIComponent(serviceId)}`,
    { method: 'DELETE' }
  );
}

export interface OrgAdminReprovisionRolesResponse {
  success: boolean;
  message: string;
  usersProcessed: number;
  assignmentsMade?: number;
  rolesAssigned: string[];
  rolesProvisioned?: string[];
}

export async function reprovisionOrgAdminRoles(
  requestId: number
): Promise<OrgAdminReprovisionRolesResponse> {
  return orgAdminRequest<OrgAdminReprovisionRolesResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}/reprovision-roles`,
    { method: 'POST' }
  );
}
