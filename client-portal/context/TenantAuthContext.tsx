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
