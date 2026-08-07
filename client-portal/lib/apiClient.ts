/**
 * API client with automatic token attachment and refresh-on-401.
 * Access token stored in memory only — never localStorage/sessionStorage.
 * Refresh token lives in HttpOnly cookie (handled by browser automatically).
 */ 

import { getGatewayBaseUrl } from './gatewayUrl';

const AUTH_TOKEN_LOG = '[auth-token]';

export function logAuthToken(event: string, data: Record<string, unknown>): void {
  if (typeof console !== 'undefined') {
    console.log(AUTH_TOKEN_LOG, event, data);
  }
}

function getVisibleCookieNames(): string[] {
  if (typeof document === 'undefined') return [];
  return document.cookie
    .split(';')
    .map((part) => part.trim().split('=')[0] ?? '')
    .filter((name) => name.length > 0);
}

function summarizeSetCookieHeader(setCookie: string | null): {
  present: boolean;
  hasRefreshToken: boolean;
  cookieNames: string[];
} {
  if (!setCookie) {
    return { present: false, hasRefreshToken: false, cookieNames: [] };
  }

  const parts = setCookie.split(/,(?=\s*[^;]+=)/);
  const cookieNames = parts
    .map((part) => part.trim().split('=')[0] ?? '')
    .filter((name) => name.length > 0);

  return {
    present: true,
    hasRefreshToken: cookieNames.includes('refreshToken'),
    cookieNames,
  };
}

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
  logAuthToken('access-token:set', {
    present: !!token,
    length: token?.length ?? 0,
  });
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  logAuthToken('access-token:clear', {});
  accessToken = null;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

// Refresh token queue — ensures only one refresh runs at a time.
// All concurrent requests that hit 401 wait for the single in-flight refresh.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const url = `${getGatewayBaseUrl()}/api/v1/auth/refresh`;

  logAuthToken('refresh:start', {
    url,
    gatewayBaseUrl: getGatewayBaseUrl(),
    pageOrigin: typeof window !== 'undefined' ? window.location.origin : null,
    credentials: 'include',
    visibleCookieNames: getVisibleCookieNames(),
    httpOnlyRefreshNote: 'HttpOnly refreshToken is not visible in document.cookie',
    accessTokenInMemory: !!accessToken,
    accessTokenLength: accessToken?.length ?? 0,
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const setCookieSummary = summarizeSetCookieHeader(res.headers.get('set-cookie'));
    const data = (await res.json()) as { data?: { accessToken?: string }; message?: string };

    logAuthToken('refresh:response', {
      status: res.status,
      ok: res.ok,
      setCookie: setCookieSummary,
      errorMessage: !res.ok ? (data.message ?? null) : null,
      accessTokenReturned: !!data.data?.accessToken,
      accessTokenLength: data.data?.accessToken?.length ?? 0,
      visibleCookieNamesAfter: getVisibleCookieNames(),
    });

    if (res.status === 401) return null;
    if (!res.ok) return null;

    const newToken = data.data?.accessToken ?? null;
    if (newToken) setAccessToken(newToken);
    return newToken;
  } catch (error) {
    logAuthToken('refresh:error', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
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

  const requestUrl = `${getGatewayBaseUrl()}${path}`;
  if (path.startsWith('/api/v1/auth/login') || path.startsWith('/api/v1/auth/refresh')) {
    logAuthToken('request:start', {
      path,
      url: requestUrl,
      skipAuth,
      accessTokenInMemory: !!accessToken,
      accessTokenLength: accessToken?.length ?? 0,
      credentials: 'include',
      visibleCookieNames: getVisibleCookieNames(),
    });
  }

  const res = await fetch(requestUrl, {
    ...fetchOptions,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (path.startsWith('/api/v1/auth/login')) {
    logAuthToken('login:response', {
      status: res.status,
      ok: res.ok,
      setCookie: summarizeSetCookieHeader(res.headers.get('set-cookie')),
      visibleCookieNamesAfter: getVisibleCookieNames(),
    });
  }

  if (path.startsWith('/api/v1/auth/refresh')) {
    logAuthToken('refresh:api-request-response', {
      status: res.status,
      ok: res.ok,
      setCookie: summarizeSetCookieHeader(res.headers.get('set-cookie')),
      visibleCookieNamesAfter: getVisibleCookieNames(),
    });
  }

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
        throw await parseApiErrorResponse(retryRes);
      }

      return parseApiSuccessResponse<T>(retryRes);
    }

    // Refresh failed — clear token, fire global event, throw
    const hadToken = !!accessToken;
    clearAccessToken();
    emitSessionExpired();
    throw new ApiError(
      hadToken
        ? 'Session expired. Please log in again.'
        : 'Authentication required. Please log in again.',
      401,
      'SESSION_EXPIRED'
    );
  }

  if (!res.ok) {
    throw await parseApiErrorResponse(res);
  }

  return parseApiSuccessResponse<T>(res);
}

async function parseApiErrorResponse(res: Response): Promise<ApiError> {
  try {
    const errorData = (await res.json()) as {
      message?: string;
      code?: string;
      nextWindow?: string | null;
      errors?: string[];
      resetToken?: string;
    };
    return new ApiError(errorData.message ?? 'Request failed', res.status, errorData.code, {
      nextWindow: errorData.nextWindow,
      errors: errorData.errors,
      resetToken: errorData.resetToken,
    });
  } catch {
    const timedOut = res.status === 502 || res.status === 504;
    return new ApiError(
      timedOut
        ? 'The service timed out or is temporarily unavailable. Please try again.'
        : `Request failed (${res.status}).`,
      res.status,
      timedOut ? 'BAD_GATEWAY' : undefined
    );
  }
}

async function parseApiSuccessResponse<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('The server returned an invalid response. Please try again.', res.status);
  }
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly nextWindow?: string | null;
  public readonly errors?: string[];
  public readonly resetToken?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    extras?: { nextWindow?: string | null; errors?: string[]; resetToken?: string }
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.nextWindow = extras?.nextWindow;
    this.errors = extras?.errors;
    this.resetToken = extras?.resetToken;
  }
}
