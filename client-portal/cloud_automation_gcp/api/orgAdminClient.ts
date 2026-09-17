import { ApiError, apiRequest } from '../../lib/apiClient';
import { directGatewayRequest } from '../../lib/directGatewayRequest';
import { GCP_ORG_ADMIN_API_PREFIX } from '../constants';
import type {
  GcpCustomIamPolicy,
  GcpCustomIamPolicyAssignment,
  GcpCustomService,
  GcpIamPolicyGroup,
  GcpOrgAdminAccessRequest,
  GcpOrgAdminDailyUsageResponse,
  GcpOrgAdminErrorKind,
  GcpOrgAdminMonitoringResponse,
  GcpOrgAdminCleanupLog,
  GcpOrgAdminPrivilegedRoleRequest,
  GcpOrgAdminRequestDetail,
  GcpOrgAdminRequestSummary,
  GcpOrgAdminLabHistory,
  GcpOrgAdminSharedCost,
  GcpOrgAdminUser,
  GcpOrgAdminUserCost,
  GcpPrivilegedRoleOption,
} from '../types/orgAdmin';

export class GcpOrgAdminError extends Error {
  readonly status: number;
  readonly kind: GcpOrgAdminErrorKind;

  constructor(message: string, status: number, kind: GcpOrgAdminErrorKind) {
    super(message);
    this.name = 'GcpOrgAdminError';
    this.status = status;
    this.kind = kind;
  }
}

function classifyError(status: number): GcpOrgAdminErrorKind {
  if (status === 401) return 'session_expired';
  return 'unknown';
}

async function orgAdminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const fullPath = `${GCP_ORG_ADMIN_API_PREFIX}${path}`;

  try {
    if (typeof window !== 'undefined') {
      return await directGatewayRequest<T>(fullPath, options);
    }

    return await apiRequest<T>(fullPath, options);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new GcpOrgAdminError(err.message, err.status, classifyError(err.status));
    }

    const message =
      err instanceof Error && err.message
        ? `Unable to reach the GCP organization admin service (${err.message}). Check your connection and try again.`
        : 'Unable to reach the GCP organization admin service. Check your connection and try again.';

    throw new GcpOrgAdminError(message, 0, 'network');
  }
}

export async function listGcpOrgRequests(
  params: { status?: string; region?: string; search?: string } = {}
): Promise<GcpOrgAdminRequestSummary[]> {
  const search = new URLSearchParams();
  if (params.status && params.status !== 'All') search.set('status', params.status);
  if (params.region && params.region !== 'All') search.set('region', params.region);
  if (params.search) search.set('search', params.search);
  const query = search.toString();

  const response = await orgAdminRequest<{ success: boolean; requests: GcpOrgAdminRequestSummary[] }>(
    `/requests${query ? `?${query}` : ''}`
  );
  return response.requests ?? [];
}

export async function getGcpOrgRequestDetail(requestId: string): Promise<GcpOrgAdminRequestDetail> {
  const response = await orgAdminRequest<{ success: boolean; detail: GcpOrgAdminRequestDetail }>(
    `/requests/${encodeURIComponent(requestId)}`
  );
  return response.detail;
}

export async function listGcpIamPolicies(): Promise<GcpIamPolicyGroup[]> {
  const response = await orgAdminRequest<{ success: boolean; policies: GcpIamPolicyGroup[] }>(
    '/iam-policies'
  );
  return response.policies ?? [];
}

export async function suspendGcpOrgUser(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/users/${userIndex}/suspend`, {
    method: 'POST',
  });
}

export async function reinstateGcpOrgUser(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/users/${userIndex}/reinstate`, {
    method: 'POST',
  });
}

export async function unblockGcpOrgUser(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/users/${userIndex}/unblock`, {
    method: 'POST',
  });
}

export async function addGcpOrgUsers(
  requestId: string,
  count = 1
): Promise<{
  addedCount: number;
  users: { userIndex: number; username: string; consoleUrl?: string | null }[];
  accountCount: number;
  userCount: number;
  customerEmail?: string;
}> {
  return orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/users`, {
    method: 'POST',
    body: JSON.stringify({ count }),
  });
}

export async function blockAllGcpOrgUsers(
  requestId: string
): Promise<{ successCount: number; attempted: number; failures?: unknown[] }> {
  return orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/block-all`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function unblockAllGcpOrgUsers(
  requestId: string,
  options: {
    resetUsage?: boolean;
    pauseWindowEnforcement?: boolean;
    pauseWindowHours?: number;
  } = {}
): Promise<{ successCount: number; attempted: number; failures?: unknown[] }> {
  return orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/unblock-all`, {
    method: 'POST',
    body: JSON.stringify({
      resetUsage: options.resetUsage !== false,
      pauseWindowEnforcement: options.pauseWindowEnforcement !== false,
      pauseWindowHours: options.pauseWindowHours ?? 24,
    }),
  });
}

export async function deleteGcpOrgUser(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/users/${userIndex}`, {
    method: 'DELETE',
  });
}

export async function generateGcpOrgConsoleUrl(
  requestId: string,
  userIndex: number
): Promise<{ consoleUrl: string; expiresAt: string }> {
  return orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/console-url`,
    { method: 'POST' }
  );
}

export async function updateGcpOrgUserPermissions(
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

export async function getGcpOrgUserCost(
  requestId: string,
  userIndex: number
): Promise<GcpOrgAdminUserCost> {
  const response = await orgAdminRequest<{ success: boolean; cost: GcpOrgAdminUserCost }>(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/cost`
  );
  return response.cost;
}

export async function renewGcpOrgUserBudget(
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

export async function triggerGcpOrgUserCleanup(
  requestId: string,
  userIndex: number,
  action: 'delete' | 'pause' = 'delete'
): Promise<{ deletedCount: number }> {
  return orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/cleanup`,
    { method: 'POST', body: JSON.stringify({ action }) }
  );
}

export async function updateGcpOrgCleanupSettings(
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

export async function updateGcpOrgRequestCleanupSettings(
  requestId: string,
  settings: { cleanupEnabled?: boolean; cleanupIntervalHours?: number; action?: 'delete' | 'pause' }
): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/cleanup-settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function getGcpOrgCleanupLogs(
  requestId: string,
  limit = 50
): Promise<GcpOrgAdminCleanupLog[]> {
  const response = await orgAdminRequest<{ success: boolean; logs: GcpOrgAdminCleanupLog[] }>(
    `/requests/${encodeURIComponent(requestId)}/cleanup-logs?limit=${limit}`
  );
  return response.logs ?? [];
}

export async function syncGcpOrgRequestSpend(requestId: string): Promise<unknown> {
  const response = await orgAdminRequest<{ success: boolean; results: unknown }>(
    `/requests/${encodeURIComponent(requestId)}/sync-spend`,
    { method: 'POST' }
  );
  return response.results;
}

export async function triggerGcpOrgAllCleanup(
  requestId: string,
  action: 'delete' | 'pause' = 'delete'
): Promise<{ deletedCount: number }> {
  return orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/cleanup-all`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export async function getGcpOrgDailyUsage(
  requestId: string
): Promise<GcpOrgAdminDailyUsageResponse> {
  return orgAdminRequest<GcpOrgAdminDailyUsageResponse>(
    `/requests/${encodeURIComponent(requestId)}/daily-usage`
  );
}

export async function getGcpOrgMonitoringLogs(
  requestId: string,
  params: { userIndex?: number; limit?: number } = {}
): Promise<GcpOrgAdminMonitoringResponse> {
  const search = new URLSearchParams();
  if (params.userIndex != null) search.set('userIndex', String(params.userIndex));
  if (params.limit != null) search.set('limit', String(params.limit));
  const query = search.toString();

  return orgAdminRequest<GcpOrgAdminMonitoringResponse>(
    `/requests/${encodeURIComponent(requestId)}/monitoring${query ? `?${query}` : ''}`
  );
}

export async function forceGcpOrgLogout(requestId: string, userIndex: number): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/force-logout`,
    { method: 'POST' }
  );
}

export async function listGcpOrgAccessRequests(
  params: { status?: string; requestId?: string } = {}
): Promise<GcpOrgAdminAccessRequest[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.requestId) search.set('requestId', params.requestId);
  const query = search.toString();
  const response = await orgAdminRequest<{
    success: boolean;
    requests: GcpOrgAdminAccessRequest[];
  }>(`/access-requests${query ? `?${query}` : ''}`);
  return response.requests ?? [];
}

export async function reviewGcpOrgAccessRequest(
  id: string,
  payload: { status: 'approved' | 'rejected'; reviewNotes?: string }
): Promise<void> {
  await orgAdminRequest(`/access-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function listGcpOrgPrivilegedRoles(): Promise<GcpPrivilegedRoleOption[]> {
  const response = await orgAdminRequest<{ success: boolean; roles: GcpPrivilegedRoleOption[] }>(
    '/privileged-roles'
  );
  return response.roles ?? [];
}

export async function listGcpOrgPrivilegedRoleRequests(
  params: { status?: string; requestId?: string } = {}
): Promise<GcpOrgAdminPrivilegedRoleRequest[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.requestId) search.set('requestId', params.requestId);
  const query = search.toString();
  const response = await orgAdminRequest<{
    success: boolean;
    requests: GcpOrgAdminPrivilegedRoleRequest[];
  }>(`/privileged-role-requests${query ? `?${query}` : ''}`);
  return response.requests ?? [];
}

export async function reviewGcpOrgPrivilegedRoleRequest(
  id: string,
  payload: { status: 'approved' | 'rejected'; reviewNotes?: string }
): Promise<{ success: boolean; request: GcpOrgAdminPrivilegedRoleRequest }> {
  return orgAdminRequest(`/privileged-role-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function assignGcpOrgPrivilegedRoleToAllUsers(
  requestId: string,
  gcpRole: string
): Promise<{ success: boolean; message?: string; rolesAssigned?: number; usersProcessed?: number }> {
  return orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/privileged-roles/assign-all`, {
    method: 'POST',
    body: JSON.stringify({ gcpRole }),
  });
}

export async function deleteGcpOrgRequest(requestId: string): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}`, { method: 'DELETE' });
}

export async function sendGcpOrgPurchaseConfirmationMail(
  requestId: string
): Promise<{ success: boolean; message?: string; recipientEmail?: string; requestId?: string }> {
  return orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/send-purchase-confirmation`,
    { method: 'POST' }
  );
}

export async function fixGcpOrgRequestPermissions(requestId: string): Promise<void> {
  await orgAdminRequest(`/requests/${encodeURIComponent(requestId)}/fix-permissions`, {
    method: 'POST',
  });
}

export async function getGcpOrgSharedCost(
  requestId: string,
  options: { refresh?: boolean } = {}
): Promise<GcpOrgAdminSharedCost> {
  const query = options.refresh ? '?refresh=true' : '';
  const response = await orgAdminRequest<{
    success: boolean;
    cost?: GcpOrgAdminSharedCost;
    summary?: GcpOrgAdminSharedCost;
  }>(`/requests/${encodeURIComponent(requestId)}/shared-cost${query}`);
  return response.cost ?? response.summary ?? {
    requestId,
    monthToDateCost: 0,
  };
}

export async function getGcpOrgLabHistory(
  requestId: string,
  params: { userIndex?: number; limit?: number } = {}
): Promise<GcpOrgAdminLabHistory> {
  const search = new URLSearchParams();
  if (params.userIndex != null) search.set('userIndex', String(params.userIndex));
  if (params.limit != null) search.set('limit', String(params.limit));
  const query = search.toString();
  const response = await orgAdminRequest<{
    success: boolean;
    history?: GcpOrgAdminLabHistory;
    entries?: GcpOrgAdminLabHistory['entries'];
  }>(`/requests/${encodeURIComponent(requestId)}/history${query ? `?${query}` : ''}`);
  return (
    response.history ?? {
      requestId,
      entries: response.entries ?? [],
      userSummaries: [],
      timeline: [],
    }
  );
}

export async function listGcpCustomIamPolicies(): Promise<GcpCustomIamPolicy[]> {
  const response = await orgAdminRequest<{ success: boolean; policies: GcpCustomIamPolicy[] }>(
    '/custom-iam-policies'
  );
  return response.policies ?? [];
}

export async function createGcpCustomIamPolicy(
  body: Omit<GcpCustomIamPolicy, 'id'>
): Promise<GcpCustomIamPolicy> {
  const response = await orgAdminRequest<{ success: boolean; policy: GcpCustomIamPolicy }>(
    '/custom-iam-policies',
    { method: 'POST', body: JSON.stringify(body) }
  );
  return response.policy;
}

export async function updateGcpCustomIamPolicy(
  id: string,
  body: Partial<Omit<GcpCustomIamPolicy, 'id'>>
): Promise<GcpCustomIamPolicy> {
  const response = await orgAdminRequest<{ success: boolean; policy: GcpCustomIamPolicy }>(
    `/custom-iam-policies/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  return response.policy;
}

export async function deleteGcpCustomIamPolicy(id: string): Promise<void> {
  await orgAdminRequest(`/custom-iam-policies/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listGcpCustomServices(): Promise<GcpCustomService[]> {
  const response = await orgAdminRequest<{ success: boolean; services: GcpCustomService[] }>(
    '/custom-services'
  );
  return response.services ?? [];
}

export async function createGcpCustomService(
  body: Omit<GcpCustomService, 'id'>
): Promise<GcpCustomService> {
  const response = await orgAdminRequest<{ success: boolean; service: GcpCustomService }>(
    '/custom-services',
    { method: 'POST', body: JSON.stringify(body) }
  );
  return response.service;
}

export async function updateGcpCustomService(
  id: string,
  body: Partial<Omit<GcpCustomService, 'id'>>
): Promise<GcpCustomService> {
  const response = await orgAdminRequest<{ success: boolean; service: GcpCustomService }>(
    `/custom-services/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  return response.service;
}

export async function deleteGcpCustomService(id: string): Promise<void> {
  await orgAdminRequest(`/custom-services/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listGcpRequestCustomServices(requestId: string): Promise<GcpCustomService[]> {
  const response = await orgAdminRequest<{ success: boolean; services: GcpCustomService[] }>(
    `/requests/${encodeURIComponent(requestId)}/custom-services`
  );
  return response.services ?? [];
}

export async function addGcpCustomServiceToRequest(
  requestId: string,
  serviceId: string
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/custom-services/${encodeURIComponent(serviceId)}`,
    { method: 'POST' }
  );
}

export async function removeGcpCustomServiceFromRequest(
  requestId: string,
  serviceId: string
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/custom-services/${encodeURIComponent(serviceId)}`,
    { method: 'DELETE' }
  );
}

export async function listGcpCustomIamAssignments(
  requestId: string
): Promise<GcpCustomIamPolicyAssignment[]> {
  const response = await orgAdminRequest<{
    success: boolean;
    assignments: GcpCustomIamPolicyAssignment[];
  }>(`/requests/${encodeURIComponent(requestId)}/custom-iam-policy-assignments`);
  return response.assignments ?? [];
}

export async function assignGcpCustomIamPolicy(
  requestId: string,
  userIndex: number,
  policyId: string
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/users/${userIndex}/custom-iam-policies`,
    { method: 'POST', body: JSON.stringify({ policyId }) }
  );
}

export async function assignGcpCustomIamPolicyToAll(
  requestId: string,
  policyId: string
): Promise<void> {
  await orgAdminRequest(
    `/requests/${encodeURIComponent(requestId)}/custom-iam-policies/assign-all`,
    { method: 'POST', body: JSON.stringify({ policyId }) }
  );
}

export async function revokeGcpCustomIamAssignment(assignmentId: string): Promise<void> {
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

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value || 0);
}
