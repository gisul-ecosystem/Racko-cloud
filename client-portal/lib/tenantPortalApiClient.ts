import { ApiError } from './apiClient';
import { getGatewayBaseUrl, getTenantDomainHeaders } from './gatewayUrl';
import type { TenantPortalUser } from '../types/tenantPortal';

const TENANT_SESSION_STORAGE_KEY = 'racko_tenant_session';

export interface StoredTenantSession {
  accessToken: string;
  tenantUser: TenantPortalUser;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { exp?: number };
    if (!payload.exp) return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export const TENANT_SESSION_EXPIRED_EVENT = 'racko:tenant_session_expired';

export function emitTenantSessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TENANT_SESSION_EXPIRED_EVENT));
  }
}

let tenantAccessToken: string | null = null;

export function persistTenantSession(session: StoredTenantSession): void {
  tenantAccessToken = session.accessToken;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(TENANT_SESSION_STORAGE_KEY, JSON.stringify(session));
  }
}

export function loadTenantSession(): StoredTenantSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(TENANT_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as StoredTenantSession;
    if (!session.accessToken || !session.tenantUser) return null;
    if (isTokenExpired(session.accessToken)) {
      clearTenantAccessToken();
      return null;
    }

    tenantAccessToken = session.accessToken;
    return session;
  } catch {
    clearTenantAccessToken();
    return null;
  }
}

export function setTenantAccessToken(token: string | null): void {
  tenantAccessToken = token;
}

export function getTenantAccessToken(): string | null {
  return tenantAccessToken;
}

export function clearTenantAccessToken(): void {
  tenantAccessToken = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TENANT_SESSION_STORAGE_KEY);
  }
}

/**
 * Opens `url` in a new tab, carrying the current tenant session along in a
 * one-time `_s` URL param. A plain `window.open(url, '_blank')` loses the
 * session because tenant auth lives in sessionStorage, which browsers only
 * clone into the new tab when an opener relationship is kept — and even
 * then, cloning isn't instant/guaranteed. TenantAuthContext reads `_s` on
 * mount, persists it into its own sessionStorage, and strips it from the URL.
 */
export function openTenantUrlWithSession(url: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const rawSession = sessionStorage.getItem(TENANT_SESSION_STORAGE_KEY);
  const sessionParam = rawSession ? btoa(encodeURIComponent(rawSession)) : '';
  const separator = url.includes('?') ? '&' : '?';
  const finalUrl = sessionParam ? `${url}${separator}_s=${sessionParam}` : url;

  window.open(finalUrl, '_blank');
}

interface TenantRequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function tenantPortalRequest<T>(
  path: string,
  options: TenantRequestOptions = {}
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;
  const API_BASE = getGatewayBaseUrl();

  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...getTenantDomainHeaders(),
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth && tenantAccessToken) {
    headers['Authorization'] = `Bearer ${tenantAccessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'omit',
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorData = (await res.json()) as { message?: string; code?: string };
    const code = errorData.code ?? errorData.message;

    if (
      !skipAuth &&
      (res.status === 401 ||
        (res.status === 403 && code === 'TENANT_MISMATCH'))
    ) {
      clearTenantAccessToken();
      emitTenantSessionExpired();
      if (code === 'TENANT_MISMATCH') {
        throw new ApiError('TENANT_MISMATCH', res.status, 'TENANT_MISMATCH');
      }
      throw new ApiError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED');
    }

    throw new ApiError(errorData.message ?? 'Request failed', res.status, code);
  }

  return res.json() as Promise<T>;
}
