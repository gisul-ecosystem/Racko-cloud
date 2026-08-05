'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  apiRequest,
  setAccessToken,
  clearAccessToken,
  ApiError,
  SESSION_EXPIRED_EVENT,
  tryRestoreSession,
  logAuthToken,
} from '../lib/apiClient';
import {
  fetchMyRbacPermissions,
  hasExecutiveHomeRole,
  SUPER_ADMIN_OVERVIEW_PATH,
} from '../lib/rbacApi';

export type UserRole = 'super_admin' | 'staff' | 'admin' | 'user';
export type AccountType = 'legacy' | 'b2c' | 'b2b';
export type OnboardingStatus =
  | 'active'
  | 'kyc_pending'
  | 'org_details_pending'
  | 'org_review_pending'
  | 'org_approved'
  | 'org_rejected';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  accountType: AccountType;
  onboardingStatus: OnboardingStatus;
  isEmailVerified: boolean;
  lastLoginAt?: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // refresh 1 minute before expiry

/**
 * Decode a JWT payload without verifying the signature.
 * Verification is the server's job — we just need the exp claim for scheduling.
 */
function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return null;
    return payload.exp * 1000; // exp is in seconds, convert to ms
  } catch {
    return null;
  }
}

/**
 * Calculate ms until we should refresh, given a token.
 * Fires TOKEN_REFRESH_BUFFER_MS before the token actually expires.
 * Falls back to 14 minutes if exp can't be read.
 */
function getRefreshDelay(token: string): number {
  const expiryMs = getTokenExpiryMs(token);
  if (!expiryMs) return 14 * 60 * 1000; // safe fallback
  const delay = expiryMs - Date.now() - TOKEN_REFRESH_BUFFER_MS;
  return Math.max(delay, 0);
}

interface LoginResponse {
  data: {
    accessToken: string;
    user: AuthUser;
  };
}

interface RefreshResponse {
  data: {
    accessToken: string;
  };
}

function getPostLoginRoute(user: AuthUser): string {
  if (user.accountType === 'b2c' && user.onboardingStatus === 'kyc_pending') {
    return '/onboarding/individual-kyc';
  }

  if (
    user.accountType === 'b2b' &&
    ['org_details_pending', 'org_review_pending', 'org_rejected'].includes(user.onboardingStatus)
  ) {
    return '/onboarding/organization';
  }

  if (user.role === 'super_admin' || user.role === 'staff') return '/super-admin-console';
  if (user.role === 'admin') return '/console';
  return '/dashboard/user';
}

async function resolveControlPlaneHome(user: AuthUser): Promise<string> {
  if (user.role !== 'staff') {
    return getPostLoginRoute(user);
  }
  try {
    const rbac = await fetchMyRbacPermissions();
    if (hasExecutiveHomeRole(rbac)) {
      return SUPER_ADMIN_OVERVIEW_PATH;
    }
  } catch {
    // Fall through to default hub
  }
  return getPostLoginRoute(user);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleTokenRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const delay = getRefreshDelay(token);

    refreshTimerRef.current = setTimeout(async () => {
      const success = await refreshToken();
      if (!success) {
        handleLogout();
      }
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshToken = useCallback(async (): Promise<boolean> => {
    logAuthToken('refresh:auth-context-start', {});
    try {
      const res = await apiRequest<RefreshResponse>('/api/v1/auth/refresh', {
        method: 'POST',
        skipAuth: true,
      });

      const newToken = res.data?.accessToken;
      if (!newToken) {
        logAuthToken('refresh:auth-context-failed', { reason: 'missing_access_token_in_response' });
        return false;
      }

      setAccessToken(newToken);
      scheduleTokenRefresh(newToken);
      logAuthToken('refresh:auth-context-success', { accessTokenLength: newToken.length });
      return true;
    } catch (error) {
      logAuthToken('refresh:auth-context-failed', {
        message: error instanceof Error ? error.message : 'unknown_error',
      });
      return false;
    }
  }, [scheduleTokenRefresh]);

  const handleLogout = useCallback(() => {
    clearAccessToken();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setState({ user: null, isLoading: false, isAuthenticated: false });
    // Full navigation so middleware sees the cleared refreshToken cookie
    window.location.replace('/login');
  }, []);

  // Listen for session-expiry events fired by apiClient when refresh fails mid-operation
  useEffect(() => {
    const handler = () => handleLogout();
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, [handleLogout]);

  // On mount: attempt to restore session from HttpOnly cookie
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      logAuthToken('session:restore-start', {
        visibleCookieNames: typeof document !== 'undefined'
          ? document.cookie.split(';').map((p) => p.trim().split('=')[0]).filter(Boolean)
          : [],
      });
      try {
        const token = await tryRestoreSession();

        if (cancelled) return;

        if (!token) {
          logAuthToken('session:restore-failed', { reason: 'no_access_token_from_refresh' });
          setState({ user: null, isLoading: false, isAuthenticated: false });
          return;
        }

        setAccessToken(token);

        // Fetch current user
        const userRes = await apiRequest<{ data: { user: AuthUser } }>('/api/v1/auth/me');
        if (cancelled) return;

        logAuthToken('session:restore-success', {
          userId: userRes.data.user.id,
          accessTokenLength: token.length,
        });

        setState({
          user: userRes.data.user,
          isLoading: false,
          isAuthenticated: true,
        });

        scheduleTokenRefresh(token);
      } catch {
        if (!cancelled) {
          setState({ user: null, isLoading: false, isAuthenticated: false });
        }
      }
    }

    restoreSession();
    return () => { cancelled = true; };
  }, [scheduleTokenRefresh]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    logAuthToken('login:start', {
      gatewayBaseUrl: typeof window !== 'undefined' ? window.location.origin : null,
    });
    const res = await apiRequest<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });

    const { accessToken, user } = res.data;
    setAccessToken(accessToken);

    logAuthToken('login:success', {
      userId: user.id,
      role: user.role,
      accessTokenLength: accessToken.length,
    });

    setState({ user, isLoading: false, isAuthenticated: true });
    scheduleTokenRefresh(accessToken);

    // Honor ?redirect= from middleware (e.g. purchase Yes link → create request page).
    let redirectTarget: string | null = null;
    if (typeof window !== 'undefined') {
      const raw = new URLSearchParams(window.location.search).get('redirect');
      if (raw) {
        try {
          const decoded = decodeURIComponent(raw);
          if (
            decoded.startsWith('/') &&
            !decoded.startsWith('//') &&
            (decoded.startsWith('/console') ||
              decoded.startsWith('/dashboard') ||
              decoded.startsWith('/super-admin-console') ||
              decoded.startsWith('/onboarding') ||
              decoded === '/request' ||
              decoded.startsWith('/status/'))
          ) {
            redirectTarget = decoded;
          }
        } catch {
          redirectTarget = null;
        }
      }
    }

    if (redirectTarget) {
      router.push(redirectTarget);
      return;
    }

    router.push(await resolveControlPlaneHome(user));
  }, [router, scheduleTokenRefresh]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiRequest('/api/v1/auth/logout', {
        method: 'POST',
        skipAuth: true,
      });
    } catch {
      // Proceed with local logout even if server call fails
    }
    handleLogout();
  }, [handleLogout]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshAccessToken: refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Safe for routes outside AuthProvider (e.g. /tenant). Returns null when absent. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
