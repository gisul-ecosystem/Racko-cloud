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
    } else {
      setState({ tenantUser: null, isLoading: false, isAuthenticated: false });
    }
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
        router.push('/tenant/dashboard/wallet');
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
