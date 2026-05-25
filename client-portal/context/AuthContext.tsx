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
} from '../lib/apiClient';

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
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
    try {
      const res = await apiRequest<RefreshResponse>('/api/v1/auth/refresh', {
        method: 'POST',
        skipAuth: true,
      });

      const newToken = res.data?.accessToken;
      if (!newToken) return false;

      setAccessToken(newToken);
      scheduleTokenRefresh(newToken);
      return true;
    } catch {
      return false;
    }
  }, [scheduleTokenRefresh]);

  const handleLogout = useCallback(() => {
    clearAccessToken();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setState({ user: null, isLoading: false, isAuthenticated: false });
    router.push('/login');
  }, [router]);

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
      try {
        const res = await apiRequest<RefreshResponse>('/api/v1/auth/refresh', {
          method: 'POST',
          skipAuth: true,
        });

        if (cancelled) return;

        const token = res.data?.accessToken;
        if (!token) {
          setState({ user: null, isLoading: false, isAuthenticated: false });
          return;
        }

        setAccessToken(token);

        // Fetch current user
        const userRes = await apiRequest<{ data: { user: AuthUser } }>('/api/v1/auth/me');
        if (cancelled) return;

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
    const res = await apiRequest<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });

    const { accessToken, user } = res.data;
    setAccessToken(accessToken);

    setState({ user, isLoading: false, isAuthenticated: true });
    scheduleTokenRefresh(accessToken);

    // Redirect based on role
    if (user.role === 'super_admin') {
      router.push('/dashboard/super-admin');
    } else if (user.role === 'admin') {
      router.push('/dashboard/admin');
    } else {
      router.push('/dashboard/user');
    }
  }, [router, scheduleTokenRefresh]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' });
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
