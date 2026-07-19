'use client';

import { ApiError, getAccessToken } from '@/lib/apiClient';
import { getDirectGatewayBaseUrl } from '@/lib/gatewayUrl';
import { getTenantAccessToken } from '@/lib/tenantPortalApiClient';
import { isTenantPortalClient } from '@/lib/portalClient';

type RequestOptions = RequestInit & { skipAuth?: boolean };

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

  const res = await fetch(`${getDirectGatewayBaseUrl()}${fullPath}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(data.message || `Request failed (${res.status}).`, res.status);
  }

  return res.json() as Promise<T>;
}
