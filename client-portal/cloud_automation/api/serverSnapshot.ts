import { cookies } from 'next/headers';
import { CLOUD_AUTOMATION_API_PREFIX } from '../constants';
import type { ProvisionSnapshot } from '../types/provisioning';
import { getGatewayBaseUrl } from '../../lib/gatewayUrl';

/** Forward a rotated refreshToken Set-Cookie from the gateway into the browser session. */
function syncRefreshCookie(refreshResponse: Response): void {
  const setCookieHeaders =
    typeof refreshResponse.headers.getSetCookie === 'function'
      ? refreshResponse.headers.getSetCookie()
      : [];

  if (setCookieHeaders.length === 0) return;

  const cookieStore = cookies();

  for (const header of setCookieHeaders) {
    const [pair, ...attrs] = header.split(';').map((part) => part.trim());
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;

    const name = pair.slice(0, eqIndex);
    const value = pair.slice(eqIndex + 1);
    if (name !== 'refreshToken' || !value) continue;

    const attrMap = new Map<string, string>();
    for (const attr of attrs) {
      const [key, ...rest] = attr.split('=');
      attrMap.set(key.toLowerCase(), rest.join('='));
    }

    const sameSiteRaw = attrMap.get('samesite')?.toLowerCase();
    const sameSite =
      sameSiteRaw === 'lax' || sameSiteRaw === 'none' || sameSiteRaw === 'strict'
        ? sameSiteRaw
        : 'strict';

    cookieStore.set(name, decodeURIComponent(value), {
      httpOnly: attrMap.has('httponly'),
      secure: attrMap.has('secure') || process.env.NODE_ENV === 'production',
      sameSite,
      path: attrMap.get('path') ?? '/',
      ...(attrMap.has('max-age')
        ? { maxAge: Number.parseInt(attrMap.get('max-age')!, 10) }
        : {}),
    });
  }
}

async function getServerAuthHeaders(): Promise<Record<string, string>> {
  const cookieStore = cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');

  if (!cookieHeader) {
    throw new Error('Authentication required.');
  }

  const refreshResponse = await fetch(`${getGatewayBaseUrl()}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    cache: 'no-store',
  });

  if (!refreshResponse.ok) {
    throw new Error('Unable to refresh session.');
  }

  syncRefreshCookie(refreshResponse);

  const refreshData = (await refreshResponse.json()) as {
    data?: { accessToken?: string };
  };
  const accessToken = refreshData.data?.accessToken;

  if (!accessToken) {
    throw new Error('Missing access token.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    Cookie: cookieHeader,
  };
}

async function gatewayRequest<T>(path: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(`${getGatewayBaseUrl()}${path}`, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(errorData.message ?? `Request failed (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

/** Server-side snapshot fetch for initial page render. */
export async function fetchProvisionSnapshotServer(
  requestId: number
): Promise<ProvisionSnapshot> {
  const headers = await getServerAuthHeaders();
  const prefix = CLOUD_AUTOMATION_API_PREFIX;

  const [
    requestResponse,
    provisionResponse,
    servicesResponse,
    usersResponse,
    rolesResponse,
    fabricResponse,
    credentialsResponse,
  ] = await Promise.allSettled([
    gatewayRequest<{ success: boolean; data?: ProvisionSnapshot['request'] }>(
      `${prefix}/requests/${requestId}`,
      headers
    ),
    gatewayRequest<{
      success: boolean;
      status?: string;
      resourceGroup?: string | null;
      resourceGroupCount?: number | null;
      accountCount?: number | null;
      complete?: boolean;
      cohorts?: ProvisionSnapshot['cohorts'];
      activeCohort?: ProvisionSnapshot['activeCohort'];
      cohortsCompleted?: number;
      cohortTotal?: number;
      allCohortsComplete?: boolean;
    }>(`${prefix}/provision/request/${requestId}`, headers),
    gatewayRequest<{ success: boolean; resources?: ProvisionSnapshot['services']['resources']; count?: number }>(
      `${prefix}/provision/request/${requestId}/services`,
      headers
    ),
    gatewayRequest<{ success: boolean; users?: ProvisionSnapshot['users']['users'] }>(
      `${prefix}/provision/request/${requestId}/users`,
      headers
    ),
    gatewayRequest<{ success: boolean; roles?: ProvisionSnapshot['roles']['roles'] }>(
      `${prefix}/provision/request/${requestId}/roles`,
      headers
    ),
    gatewayRequest<{
      success: boolean;
      required?: boolean;
      complete?: boolean;
      status?: string;
      workspaceId?: string | null;
      capacityId?: string | null;
      workspaceName?: string | null;
      workspaceRole?: string | null;
      onelakePermissions?: string | null;
      items?: unknown[];
      roleAssignments?: unknown[];
      certTag?: string | null;
      errorMessage?: string | null;
    }>(`${prefix}/provision/request/${requestId}/fabric`, headers),
    gatewayRequest<{ success: boolean; deliveryStatus?: string | null }>(
      `${prefix}/provision/request/${requestId}/credentials`,
      headers
    ),
  ]);

  const request =
    requestResponse.status === 'fulfilled' ? (requestResponse.value.data ?? null) : null;
  const provisionRaw =
    provisionResponse.status === 'fulfilled' ? provisionResponse.value : null;
  const provision = provisionRaw
    ? {
        status: provisionRaw.status,
        resourceGroup: provisionRaw.resourceGroup ?? null,
        resourceGroupId: null,
        resourceGroupCount: provisionRaw.resourceGroupCount ?? null,
        accountCount: provisionRaw.accountCount ?? null,
        complete: provisionRaw.complete === true,
      }
    : null;
  const servicesResources =
    servicesResponse.status === 'fulfilled' && Array.isArray(servicesResponse.value.resources)
      ? servicesResponse.value.resources
      : [];
  const users =
    usersResponse.status === 'fulfilled' && Array.isArray(usersResponse.value.users)
      ? usersResponse.value.users
      : [];
  const roles =
    rolesResponse.status === 'fulfilled' && Array.isArray(rolesResponse.value.roles)
      ? rolesResponse.value.roles
      : [];
  const fabricRaw =
    fabricResponse.status === 'fulfilled'
      ? fabricResponse.value
      : {
          required: false,
          complete: true,
          status: 'skipped' as string | null,
          workspaceId: null as string | null,
          capacityId: null as string | null,
          workspaceName: null as string | null,
          workspaceRole: null as string | null,
          onelakePermissions: null as string | null,
          items: [] as unknown[],
          roleAssignments: [] as unknown[],
          certTag: null as string | null,
          errorMessage: null as string | null,
        };
  const credentials =
    credentialsResponse.status === 'fulfilled'
      ? { deliveryStatus: credentialsResponse.value.deliveryStatus ?? null }
      : null;

  return {
    request,
    provision,
    services: {
      resources: servicesResources,
      count: servicesResources.length,
    },
    users: {
      users,
      count: users.length,
    },
    roles: {
      roles,
      count: roles.length,
    },
    fabric: {
      required: fabricRaw.required === true,
      complete: fabricRaw.required === true ? fabricRaw.complete === true : true,
      status: fabricRaw.status ?? null,
      workspaceId: fabricRaw.workspaceId ?? null,
      capacityId: fabricRaw.capacityId ?? null,
      workspaceName: fabricRaw.workspaceName ?? null,
      workspaceRole: fabricRaw.workspaceRole ?? null,
      onelakePermissions: fabricRaw.onelakePermissions ?? null,
      items: Array.isArray(fabricRaw.items) ? fabricRaw.items : [],
      roleAssignments: Array.isArray(fabricRaw.roleAssignments)
        ? fabricRaw.roleAssignments
        : [],
      certTag: fabricRaw.certTag ?? null,
      errorMessage: fabricRaw.errorMessage ?? null,
    },
    credentials,
    cohorts: Array.isArray(provisionRaw?.cohorts) ? provisionRaw.cohorts : [],
    activeCohort: provisionRaw?.activeCohort ?? null,
    cohortTotal: provisionRaw?.cohortTotal,
    cohortsCompleted: provisionRaw?.cohortsCompleted,
    allCohortsComplete: provisionRaw?.allCohortsComplete === true,
    fetchedAt: new Date().toISOString(),
  };
}
