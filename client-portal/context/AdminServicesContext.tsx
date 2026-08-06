'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  fetchMyAdminServices,
  type AdminAssignedService,
  type AdminServiceKey,
} from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';

interface AdminServicesState {
  services: AdminAssignedService[];
  loading: boolean;
  error: string | null;
  hasActiveService: (serviceKey: AdminServiceKey) => boolean;
  refresh: () => Promise<void>;
}

const AdminServicesContext = createContext<AdminServicesState | null>(null);

export function AdminServicesProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [services, setServices] = useState<AdminAssignedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || user?.role !== 'admin') {
      setServices([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setServices(await fetchMyAdminServices());
    } catch (err) {
      setServices([]);
      setError(err instanceof Error ? err.message : 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasActiveService = useCallback(
    (serviceKey: AdminServiceKey) => {
      if (isServiceHiddenFromUi(serviceKey)) return false;
      // Super admins can open Azure (and other) console routes e.g. purchase convert links.
      if (user?.role === 'super_admin') return true;
      return services.some((s) => s.serviceKey === serviceKey && s.status === 'active');
    },
    [services, user?.role]
  );

  const value = useMemo(
    () => ({ services, loading, error, hasActiveService, refresh }),
    [services, loading, error, hasActiveService, refresh]
  );

  return (
    <AdminServicesContext.Provider value={value}>{children}</AdminServicesContext.Provider>
  );
}

export function useAdminServices(): AdminServicesState {
  const ctx = useContext(AdminServicesContext);
  if (!ctx) {
    throw new Error('useAdminServices must be used within AdminServicesProvider');
  }
  return ctx;
}
