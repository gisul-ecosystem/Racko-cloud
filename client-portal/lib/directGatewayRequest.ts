'use client';

import { ApiError, getAccessToken, setAccessToken, clearAccessToken, SESSION_EXPIRED_EVENT } from '@/lib/apiClient';
import { getDirectGatewayBaseUrl, getGatewayBaseUrl } from '@/lib/gatewayUrl';
import { getTenantAccessToken } from '@/lib/tenantPortalApiClient';
import { isTenantPortalClient } from '@/lib/portalClient';

type RequestOptions = RequestInit & { skipAuth?: boolean };

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
  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = isTenantPortalClient() ? getTenantAccessToken() : getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = `${getDirectGatewayBaseUrl()}${fullPath}`;
  let res = await fetch(url, {
    ...fetchOptions,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  // Match apiRequest: refresh once on 401 for platform sessions, then retry.
  if (res.status === 401 && !skipAuth && !isTenantPortalClient()) {
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

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(data.message || `Request failed (${res.status}).`, res.status);
  }

  return res.json() as Promise<T>;
}
