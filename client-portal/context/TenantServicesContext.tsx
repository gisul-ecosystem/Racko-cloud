'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { getTenantServices } from '@/lib/tenantPortalApi';
import type { TenantAssignedService, TenantServiceKey } from '@/types/tenantPortal';

interface TenantServicesState {
  services: TenantAssignedService[];
  loading: boolean;
  error: string | null;
  hasActiveService: (serviceKey: TenantServiceKey) => boolean;
  refresh: () => Promise<void>;
}

const TenantServicesContext = createContext<TenantServicesState | null>(null);

export function TenantServicesProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useTenantAuth();
  const [services, setServices] = useState<TenantAssignedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setServices([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const list = await getTenantServices();
      setServices(list);
    } catch (err) {
      setServices([]);
      setError(err instanceof Error ? err.message : 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // TenantAuthContext mounts *below* us in effect order, so on first mount
    // isAuthenticated is still its initial `false` — before the real check
    // (sessionStorage / a new-tab `_s` param handoff) has run. Without this
    // guard we'd synchronously conclude "unauthenticated, no services" and
    // commit loading=false before auth ever gets a chance to resolve, which
    // lets RequireTenantService fire its redirect on stale data. Only decide
    // once TenantAuthContext itself is done loading.
    if (authLoading) return;
    void refresh();
  }, [refresh, authLoading]);

  const hasActiveService = useCallback(
    (serviceKey: TenantServiceKey) =>
      services.some((s) => s.serviceKey === serviceKey && s.status === 'active'),
    [services]
  );

  const value = useMemo(
    () => ({ services, loading, error, hasActiveService, refresh }),
    [services, loading, error, hasActiveService, refresh]
  );

  return (
    <TenantServicesContext.Provider value={value}>{children}</TenantServicesContext.Provider>
  );
}

export function useTenantServices(): TenantServicesState {
  const ctx = useContext(TenantServicesContext);
  if (!ctx) {
    throw new Error('useTenantServices must be used within TenantServicesProvider');
  }
  return ctx;
}
