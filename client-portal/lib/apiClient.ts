/**
 * API client with automatic token attachment and refresh-on-401.
 * Access token stored in memory only — never localStorage/sessionStorage.
 * Refresh token lives in HttpOnly cookie (handled by browser automatically).
 */ 

import { getGatewayBaseUrl } from './gatewayUrl';

// Global session-expiry event — fired by apiClient when refresh fails mid-session
export const SESSION_EXPIRED_EVENT = 'racko:session_expired';

export function emitSessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

// In-memory token store — cleared on page refresh (intentional security decision)
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${getGatewayBaseUrl()}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 401) return null;

    const data = (await res.json()) as { data?: { accessToken?: string } };
    const newToken = data.data?.accessToken ?? null;
    if (!res.ok) return null;

    if (newToken) setAccessToken(newToken);
    return newToken;
  } catch {
    return null;
  }
}

/** Restore session on app load; returns null when no cookie (expected, not an error). */
export async function tryRestoreSession(): Promise<string | null> {
  return refreshAccessToken();
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${getGatewayBaseUrl()}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  // On 401, attempt token refresh once then retry
  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryRes = await fetch(`${getGatewayBaseUrl()}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
        cache: 'no-store',
      });

      if (!retryRes.ok) {
        const errorData = (await retryRes.json()) as { message?: string; code?: string };
        throw new ApiError(errorData.message ?? 'Request failed', retryRes.status, errorData.code);
      }

      return retryRes.json() as Promise<T>;
    }

    // Refresh failed — clear token, fire global event, throw
    clearAccessToken();
    emitSessionExpired();
    throw new ApiError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED');
  }

  if (!res.ok) {
    const errorData = (await res.json()) as { message?: string; code?: string };
    throw new ApiError(errorData.message ?? 'Request failed', res.status, errorData.code);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
