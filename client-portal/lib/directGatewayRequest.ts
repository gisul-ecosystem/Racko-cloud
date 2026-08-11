'use client';

import { ApiError, getAccessToken, setAccessToken, clearAccessToken, SESSION_EXPIRED_EVENT } from '@/lib/apiClient';
import {
  getDirectGatewayBaseUrl,
  getGatewayBaseUrl,
  getTenantGatewayIdentityHeaders,
} from '@/lib/gatewayUrl';
import {
  clearTenantAccessToken,
  emitTenantSessionExpired,
  getTenantAccessToken,
} from '@/lib/tenantPortalApiClient';
import { isTenantPortalClient } from '@/lib/portalClient';

type RequestOptions = RequestInit & { skipAuth?: boolean };

const PROVISION_NETWORK_RETRIES = 2;

function isProvisionNetworkFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshPlatformAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${getGatewayBaseUrl()}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      data?: { accessToken?: string };
    };
    const token = data.data?.accessToken ?? null;
    if (token) setAccessToken(token);
    return token;
  } catch {
    return null;
  }
}

/**
 * Calls the cloud-gateway directly from the browser.
 * Bypasses Next.js dev rewrites, which reset sockets on slow responses.
 */
export async function directGatewayRequest<T>(
  fullPath: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;
  const isTenant = isTenantPortalClient();
  const gatewayBase = getDirectGatewayBaseUrl();
  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(isTenant ? getTenantGatewayIdentityHeaders(gatewayBase) : {}),
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = isTenant ? getTenantAccessToken() : getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = `${gatewayBase}${fullPath}`;
  const isProvisionCall = fullPath.includes('/provision/request/');
  const maxAttempts = isProvisionCall ? PROVISION_NETWORK_RETRIES + 1 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res: Response;

    try {
      res = await fetch(url, {
        ...fetchOptions,
        headers,
        credentials: isTenant ? 'omit' : 'include',
        cache: 'no-store',
      });
    } catch (error) {
      if (!isProvisionNetworkFailure(error) || attempt >= maxAttempts) {
        throw new ApiError(
          'The provisioning request was interrupted before the server responded. This usually means a network or proxy timeout — provisioning will retry automatically.',
          0,
          'NETWORK_ERROR'
        );
      }

      await sleep(1500 * attempt);
      continue;
    }

    // Match apiRequest: refresh once on 401 for platform sessions, then retry.
    if (res.status === 401 && !skipAuth && !isTenant) {
      const newToken = await refreshPlatformAccessToken();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(url, {
          ...fetchOptions,
          headers,
          credentials: 'include',
          cache: 'no-store',
        });
      } else {
        clearAccessToken();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        }
      }
    }

    if (res.status === 401 && !skipAuth && isTenant) {
      clearTenantAccessToken();
      emitTenantSessionExpired();
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
      const retriableStatus = [408, 429, 500, 502, 503, 504].includes(res.status);

      if (isProvisionCall && retriableStatus && attempt < maxAttempts) {
        await sleep(1500 * attempt);
        continue;
      }

      throw new ApiError(data.message || `Request failed (${res.status}).`, res.status, data.code);
    }

    return res.json() as Promise<T>;
  }

  throw new ApiError(
    'The provisioning request was interrupted before the server responded. Provisioning will retry automatically.',
    0,
    'NETWORK_ERROR'
  );
}
