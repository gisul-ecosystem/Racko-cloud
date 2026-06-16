import { MANAGE_PORTAL_API_PREFIX } from '../constants';
import type {
  ManagePortalErrorKind,
  ManagePortalConsoleLaunchResponse,
  ManagePortalLoginResponse,
  ManagePortalMutationResponse,
  ManagePortalUsersResponse,
} from '../types/managePortal';

const API_BASE = process.env['NEXT_PUBLIC_GATEWAY_URL'] ?? 'http://localhost:8000';

export class ManagePortalError extends Error {
  readonly status: number;
  readonly kind: ManagePortalErrorKind;

  constructor(message: string, status: number, kind: ManagePortalErrorKind) {
    super(message);
    this.name = 'ManagePortalError';
    this.status = status;
    this.kind = kind;
  }
}

function classifyError(status: number, message: string): ManagePortalErrorKind {
  const lower = message.toLowerCase();

  if (status === 401) {
    if (lower.includes('expired')) return 'expired_link';
    if (lower.includes('invalid') && lower.includes('link')) return 'invalid_token';
    if (lower.includes('already been used')) return 'invalid_token';
    if (lower.includes('username') || lower.includes('password')) return 'invalid_credentials';
    if (lower.includes('session')) return 'session_expired';
    return 'invalid_token';
  }

  if (status === 403) {
    if (lower.includes('limit') || lower.includes('blocked') || lower.includes('window')) {
      return 'blocked_access';
    }
    return 'blocked_access';
  }

  if (status === 400 && lower.includes('token')) return 'missing_token';

  return 'unknown';
}

async function manageRequest<T>(
  path: string,
  options: RequestInit & { sessionToken?: string } = {}
): Promise<T> {
  const { sessionToken, headers: customHeaders, ...rest } = options;
  const headers = new Headers(customHeaders);

  if (!headers.has('Content-Type') && rest.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (sessionToken) {
    headers.set('x-access-session', sessionToken);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${MANAGE_PORTAL_API_PREFIX}${path}`, {
      ...rest,
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new ManagePortalError(
      'Unable to reach the manage portal service. Check your connection and try again.',
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
    throw new ManagePortalError(message, response.status, classifyError(response.status, message));
  }

  return payload as T;
}

export async function loginManagePortal(params: {
  token: string;
  username: string;
  password: string;
}): Promise<ManagePortalLoginResponse> {
  return manageRequest<ManagePortalLoginResponse>('/login', {
    method: 'POST',
    body: JSON.stringify({
      token: params.token,
      username: params.username,
      password: params.password,
    }),
  });
}

export async function fetchManagePortalConsoleLaunch(params: {
  requestId: number;
  userId: number;
  sessionToken: string;
}): Promise<ManagePortalConsoleLaunchResponse> {
  return manageRequest<ManagePortalConsoleLaunchResponse>(
    `/user/${params.userId}/console?requestId=${params.requestId}`,
    {
      method: 'GET',
      sessionToken: params.sessionToken,
    }
  );
}

export interface ManagePortalUsageStatus {
  enableDailyUsage: boolean;
  usedMinutes: number;
  storedUsedMinutes: number;
  currentSessionMinutes: number;
  remainingMinutes: number | null;
  dailyLimitMinutes: number | null;
  hasActiveSession: boolean;
  blocked: boolean;
  blockedUntil: string | null;
  withinWindow: boolean;
  accessMessage: string;
}

export async function fetchManagePortalUsageStatus(params: {
  requestId: number;
  userId: number;
  sessionToken: string;
}): Promise<ManagePortalUsageStatus> {
  const payload = await manageRequest<{ success?: boolean; data?: ManagePortalUsageStatus }>(
    `/user/${params.userId}/usage?requestId=${params.requestId}`,
    {
      method: 'GET',
      sessionToken: params.sessionToken,
    }
  );

  if (!payload.data) {
    throw new ManagePortalError('Usage status is unavailable.', 500, 'unknown');
  }

  return payload.data;
}

export async function endManagePortalUsageSession(params: {
  requestId: number;
  userId: number;
  sessionToken: string;
}): Promise<{ ended: boolean }> {
  const payload = await manageRequest<{ success?: boolean; data?: { ended?: boolean } }>(
    `/user/${params.userId}/usage/end?requestId=${params.requestId}`,
    {
      method: 'POST',
      sessionToken: params.sessionToken,
      body: JSON.stringify({ requestId: params.requestId }),
    }
  );

  return { ended: payload.data?.ended === true };
}

export async function fetchManagePortalUsers(
  requestId: number,
  sessionToken: string
): Promise<ManagePortalUsersResponse> {
  return manageRequest<ManagePortalUsersResponse>(`/request/${requestId}`, {
    method: 'GET',
    sessionToken,
  });
}

export async function updateManagePortalUserRoles(params: {
  requestId: number;
  userId: number;
  roles: string[];
  sessionToken: string;
}): Promise<ManagePortalMutationResponse> {
  return manageRequest<ManagePortalMutationResponse>(`/user/${params.userId}/roles`, {
    method: 'PATCH',
    sessionToken: params.sessionToken,
    body: JSON.stringify({
      requestId: params.requestId,
      roles: params.roles,
    }),
  });
}

export async function deleteManagePortalUser(params: {
  requestId: number;
  userId: number;
  sessionToken: string;
}): Promise<ManagePortalMutationResponse> {
  return manageRequest<ManagePortalMutationResponse>(
    `/user/${params.userId}?requestId=${params.requestId}`,
    {
      method: 'DELETE',
      sessionToken: params.sessionToken,
    }
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
