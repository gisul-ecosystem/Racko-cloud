'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError } from '@/lib/apiClient';
import { fetchMyTenantRbac, type MyTenantRbac } from '@/lib/tenantRbacApi';
import { useTenantAuth } from '@/context/TenantAuthContext';

interface TenantRbacContextValue {
  loading: boolean;
  me: MyTenantRbac | null;
  isTenantAdmin: boolean;
  isConsoleOperator: boolean;
  /** Admin or invited console operator — may use the services hub. */
  isConsoleStaff: boolean;
  permissions: Set<string>;
  hasPermission: (...keys: string[]) => boolean;
  refresh: () => Promise<void>;
}

const TenantRbacContext = createContext<TenantRbacContextValue | null>(null);

export function TenantRbacProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, tenantUser } = useTenantAuth();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MyTenantRbac | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchMyTenantRbac();
      setMe(data);
    } catch (err) {
      // Fall back to login payload flags when /me fails (e.g. network blip).
      if (err instanceof ApiError && err.status === 401) {
        setMe(null);
      } else if (tenantUser) {
        setMe({
          role: tenantUser.role,
          tenantId: tenantUser.tenantId,
          isTenantAdmin: tenantUser.role === 'tenant_admin',
          isConsoleOperator: Boolean(tenantUser.isConsoleOperator),
          permissions:
            tenantUser.role === 'tenant_admin' || tenantUser.isConsoleOperator
              ? ['console.access']
              : [],
        });
      } else {
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, tenantUser]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const permissions = useMemo(() => new Set(me?.permissions || []), [me]);

  const value = useMemo<TenantRbacContextValue>(() => {
    const isTenantAdmin = Boolean(me?.isTenantAdmin || tenantUser?.role === 'tenant_admin');
    const isConsoleOperator = Boolean(
      me?.isConsoleOperator || tenantUser?.isConsoleOperator || isTenantAdmin
    );
    return {
      loading: authLoading || loading,
      me,
      isTenantAdmin,
      isConsoleOperator,
      isConsoleStaff: isTenantAdmin || isConsoleOperator,
      permissions,
      hasPermission: (...keys: string[]) => {
        if (isTenantAdmin) return true;
        return keys.some((k) => permissions.has(k));
      },
      refresh,
    };
  }, [authLoading, loading, me, permissions, refresh, tenantUser]);

  return <TenantRbacContext.Provider value={value}>{children}</TenantRbacContext.Provider>;
}

export function useTenantRbac(): TenantRbacContextValue {
  const ctx = useContext(TenantRbacContext);
  if (!ctx) {
    throw new Error('useTenantRbac must be used within TenantRbacProvider');
  }
  return ctx;
}

/** Safe when provider may be absent (returns conservative defaults). */
export function useTenantRbacOptional(): TenantRbacContextValue | null {
  return useContext(TenantRbacContext);
}
