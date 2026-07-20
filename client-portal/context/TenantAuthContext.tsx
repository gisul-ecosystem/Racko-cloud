'use client';
 
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  clearTenantAccessToken,
  loadTenantSession,
  persistTenantSession,
  TENANT_SESSION_EXPIRED_EVENT,
} from '../lib/tenantPortalApiClient';
import { getTenantDefaultDashboardPath } from '../lib/tenantPortalRoutes';
import { tenantLogin as apiTenantLogin } from '../lib/tenantPortalApi';
import { ApiError } from '../lib/apiClient';
import type { TenantPortalUser } from '../types/tenantPortal';

interface TenantAuthState {
  tenantUser: TenantPortalUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface TenantAuthContextValue extends TenantAuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const TenantAuthContext = createContext<TenantAuthContextValue | null>(null);

export function TenantAuthProvider({ children }: { children: React.ReactNode }) {
  // isLoading starts true and only ever flips to false once, after the
  // mount effect below has checked sessionStorage. Consumers (e.g. route
  // guards) must treat isLoading=true as "unknown yet" — NOT as logged out —
  // and only redirect once isLoading is false AND isAuthenticated is false.
  const [state, setState] = useState<TenantAuthState>({
    tenantUser: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const router = useRouter();

  useEffect(() => {
    // A console opened via window.open() into a new tab appends a one-time
    // `_s` param carrying the caller's session (see TenantUserResourcesTabs /
    // tenant elastic-servers list). This is more reliable than depending on
    // the browser's same-origin sessionStorage cloning behavior. Consume it
    // before the normal sessionStorage check so it takes effect immediately,
    // then strip it from the URL so it never lingers in history/bookmarks.
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionParam = urlParams.get('_s');
      if (sessionParam) {
        try {
          const raw = decodeURIComponent(atob(sessionParam));
          const session = JSON.parse(raw);
          if (session.accessToken && session.tenantUser) {
            persistTenantSession(session);
          }
        } catch {
          // Malformed/tampered _s param — ignore and fall through to the
          // normal sessionStorage check below.
        }
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('_s');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }

    const session = loadTenantSession();
    if (session) {
      setState({
        tenantUser: session.tenantUser,
        isLoading: false,
        isAuthenticated: true,
      });
      return;
    }

    // sessionStorage may not be cloned yet in a new tab opened via
    // window.open() — retry once after a short delay before concluding
    // the user is unauthenticated.
    const timer = setTimeout(() => {
      const retrySession = loadTenantSession();
      if (retrySession) {
        setState({
          tenantUser: retrySession.tenantUser,
          isLoading: false,
          isAuthenticated: true,
        });
      } else {
        setState({ tenantUser: null, isLoading: false, isAuthenticated: false });
      }
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  const logout = useCallback(() => {
    clearTenantAccessToken();
    setState({ tenantUser: null, isLoading: false, isAuthenticated: false });
    router.replace('/tenant/login');
  }, [router]);

  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener(TENANT_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(TENANT_SESSION_EXPIRED_EVENT, onExpired);
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { accessToken, tenantUser } = await apiTenantLogin(email, password);
        persistTenantSession({ accessToken, tenantUser });
        setState({
          tenantUser,
          isLoading: false,
          isAuthenticated: true,
        });
        router.push(getTenantDefaultDashboardPath(tenantUser.role));
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError('Login failed.', 500);
      }
    },
    [router]
  );

  return (
    <TenantAuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </TenantAuthContext.Provider>
  );
}

export function useTenantAuth(): TenantAuthContextValue {
  const ctx = useContext(TenantAuthContext);
  if (!ctx) throw new Error('useTenantAuth must be used within TenantAuthProvider');
  return ctx;
}
