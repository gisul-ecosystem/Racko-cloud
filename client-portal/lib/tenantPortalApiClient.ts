import { ApiError } from './apiClient';
import { getGatewayBaseUrl, getTenantGatewayIdentityHeaders } from './gatewayUrl';
import type { TenantPortalUser } from '../types/tenantPortal';

const TENANT_SESSION_STORAGE_KEY = 'racko_tenant_session';

/** One-time localStorage handoff for new tabs (avoids huge / fragile `_s` URLs). */
export const TENANT_TAB_HANDOFF_PREFIX = 'racko_tenant_tab_handoff:';
const TENANT_TAB_HANDOFF_TTL_MS = 120_000;

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

function getRawTenantSessionForHandoff(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = sessionStorage.getItem(TENANT_SESSION_STORAGE_KEY);
  if (fromStorage) return fromStorage;
  const loaded = loadTenantSession();
  if (loaded) return JSON.stringify(loaded);
  return null;
}

/** Read and delete a one-time `_h` handoff written by {@link openTenantUrlWithSession}. */
export function consumeTenantTabHandoff(handoffId: string): StoredTenantSession | null {
  if (typeof window === 'undefined' || !handoffId) return null;

  const key = `${TENANT_TAB_HANDOFF_PREFIX}${handoffId}`;
  const expKey = `${key}:exp`;
  try {
    const expRaw = localStorage.getItem(expKey);
    const exp = expRaw ? Number(expRaw) : 0;
    if (exp && Date.now() > exp) {
      localStorage.removeItem(key);
      localStorage.removeItem(expKey);
      return null;
    }

    const raw = localStorage.getItem(key);
    localStorage.removeItem(key);
    localStorage.removeItem(expKey);
    if (!raw) return null;

    const session = JSON.parse(raw) as StoredTenantSession;
    if (!session.accessToken || !session.tenantUser) return null;
    if (isTokenExpired(session.accessToken)) return null;
    return session;
  } catch {
    localStorage.removeItem(key);
    localStorage.removeItem(expKey);
    return null;
  }
}

function encodeSessionForUrlParam(rawSession: string): string {
  const base64 = btoa(encodeURIComponent(rawSession));
  return encodeURIComponent(base64);
}

/**
 * Opens `url` in a new tab, carrying the current tenant session.
 * Prefer a short `_h` localStorage handoff; fall back to `_s` when needed.
 */
export function openTenantUrlWithSession(url: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const rawSession = getRawTenantSessionForHandoff();
  const separator = url.includes('?') ? '&' : '?';

  if (!rawSession) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    const handoffId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const key = `${TENANT_TAB_HANDOFF_PREFIX}${handoffId}`;
    localStorage.setItem(key, rawSession);
    localStorage.setItem(`${key}:exp`, String(Date.now() + TENANT_TAB_HANDOFF_TTL_MS));
    window.open(`${url}${separator}_h=${encodeURIComponent(handoffId)}`, '_blank', 'noopener,noreferrer');
    return;
  } catch {
    // localStorage full / private mode — fall back to `_s`
  }

  const sessionParam = encodeSessionForUrlParam(rawSession);
  window.open(`${url}${separator}_s=${sessionParam}`, '_blank', 'noopener,noreferrer');
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
    ...getTenantGatewayIdentityHeaders(API_BASE),
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
    const errorData = (await res.json()) as {
      message?: string;
      code?: string;
      nextWindow?: string | null;
      errors?: string[];
    };
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

    throw new ApiError(errorData.message ?? 'Request failed', res.status, code, {
      nextWindow: errorData.nextWindow,
      errors: errorData.errors,
    });
  }

  return res.json() as Promise<T>;
}
