import { ORG_ADMIN_API_PREFIX } from '../constants';
import type {
  OrgAdminAccessRequest,
  OrgAdminAzureRoleOption,
  OrgAdminAzureRolesResponse,
  OrgAdminDailyUsageResponse,
  OrgAdminErrorKind,
  OrgAdminLoginResponse,
  OrgAdminMonitoringResponse,
  OrgAdminResourceGroup,
  OrgAdminResourceGroupDetailResponse,
  OrgAdminUser,
  OrgAdminUserAzureCostResponse,
} from '../types/orgAdmin';

const API_BASE = process.env['NEXT_PUBLIC_GATEWAY_URL'] ?? 'http://localhost:8000';

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
    if (lower.includes('session')) return 'session_expired';
    return 'session_expired';
  }

  return 'unknown';
}

async function orgAdminRequest<T>(
  path: string,
  options: RequestInit & { sessionToken?: string } = {}
): Promise<T> {
  const { sessionToken, headers: customHeaders, ...rest } = options;
  const headers = new Headers(customHeaders);

  if (!headers.has('Content-Type') && rest.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (sessionToken) {
    headers.set('x-org-admin-session', sessionToken);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${ORG_ADMIN_API_PREFIX}${path}`, {
      ...rest,
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new OrgAdminError(
      'Unable to reach the organization admin service. Check your connection and try again.',
      0,
      'network'
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
  };

  if (!response.ok) {
    const message = payload.message || 'Request failed.';
    throw new OrgAdminError(message, response.status, classifyError(response.status, message));
  }

  return payload as T;
}

export async function loginOrgAdmin(params: {
  email: string;
  username: string;
  password: string;
}): Promise<OrgAdminLoginResponse> {
  return orgAdminRequest<OrgAdminLoginResponse>('/login', {
    method: 'POST',
    body: JSON.stringify({
      email: params.email,
      username: params.username,
      password: params.password,
    }),
  });
}

export async function listOrgResourceGroups(sessionToken: string): Promise<OrgAdminResourceGroup[]> {
  const response = await orgAdminRequest<{ success: boolean; resourceGroups: OrgAdminResourceGroup[] }>(
    '/resource-groups',
    { sessionToken }
  );
  return response.resourceGroups ?? [];
}

export async function getOrgResourceGroupDetail(
  sessionToken: string,
  requestId: number
): Promise<OrgAdminResourceGroupDetailResponse> {
  return orgAdminRequest<OrgAdminResourceGroupDetailResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}`,
    { sessionToken }
  );
}

export async function getOrgMonitoringLogs(
  sessionToken: string,
  requestId: number,
  params: { userId?: number; limit?: number } = {}
): Promise<OrgAdminMonitoringResponse> {
  const search = new URLSearchParams();
  if (params.userId != null) search.set('userId', String(params.userId));
  if (params.limit != null) search.set('limit', String(params.limit));
  const query = search.toString();

  return orgAdminRequest<OrgAdminMonitoringResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}/monitoring${query ? `?${query}` : ''}`,
    { sessionToken }
  );
}

export async function deleteOrgAdminUser(
  sessionToken: string,
  requestId: number,
  userId: number
): Promise<{ success: boolean; user: OrgAdminUser }> {
  return orgAdminRequest(`/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    sessionToken,
  });
}

export async function updateOrgAdminUserRoles(
  sessionToken: string,
  requestId: number,
  userId: number,
  roles: string[]
): Promise<{ success: boolean; user: OrgAdminUser }> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/roles`,
    {
      method: 'PATCH',
      sessionToken,
      body: JSON.stringify({ roles }),
    }
  );
}

export async function forceOrgAdminLogout(
  sessionToken: string,
  requestId: number,
  userId: number
): Promise<{ success: boolean }> {
  return orgAdminRequest(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/force-logout`,
    {
      method: 'POST',
      sessionToken,
    }
  );
}

export async function getOrgUserAzureCost(
  sessionToken: string,
  requestId: number,
  userId: number
): Promise<OrgAdminUserAzureCostResponse> {
  return orgAdminRequest<OrgAdminUserAzureCostResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}/users/${encodeURIComponent(userId)}/azure-cost`,
    { sessionToken }
  );
}

export async function getOrgDailyUsage(
  sessionToken: string,
  requestId: number
): Promise<OrgAdminDailyUsageResponse> {
  return orgAdminRequest<OrgAdminDailyUsageResponse>(
    `/resource-groups/${encodeURIComponent(requestId)}/daily-usage`,
    { sessionToken }
  );
}

export async function listOrgAzureRoles(
  sessionToken: string
): Promise<OrgAdminAzureRoleOption[]> {
  const response = await orgAdminRequest<OrgAdminAzureRolesResponse>('/azure/roles', {
    sessionToken,
  });
  return response.data ?? [];
}

export async function listOrgAccessRequests(
  sessionToken: string,
  params: { status?: string; requestId?: number } = {}
): Promise<OrgAdminAccessRequest[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.requestId != null) search.set('requestId', String(params.requestId));
  const query = search.toString();

  const response = await orgAdminRequest<{ success: boolean; requests: OrgAdminAccessRequest[] }>(
    `/access-requests${query ? `?${query}` : ''}`,
    { sessionToken }
  );
  return response.requests ?? [];
}

export async function reviewOrgAccessRequest(
  sessionToken: string,
  id: number,
  payload: { status: 'approved' | 'rejected'; reviewNotes?: string }
): Promise<{ success: boolean; request: OrgAdminAccessRequest }> {
  return orgAdminRequest(`/access-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    sessionToken,
    body: JSON.stringify(payload),
  });
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
