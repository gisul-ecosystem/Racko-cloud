'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchMyVMs, fetchAllVMsAdmin, type IVM } from '../lib/vmApi';
import { ApiError } from '../lib/apiClient';

interface UseVMsResult {
  vms: IVM[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMyVMs(
  isAuthenticated: boolean,
  filters?: { status?: string; cloneType?: string; node?: string }
): UseVMsResult {
  const [vms, setVMs] = useState<IVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMyVMs(filters);
      setVMs(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500 ? 'Service temporarily unavailable.' : err.message
          : 'Failed to load VMs.'
      );
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.cloneType, filters?.node]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return { vms, loading, error, refetch: load };
}

export function useAllVMsAdmin(
  isAuthenticated: boolean,
  filters?: { status?: string; cloneType?: string; node?: string }
): UseVMsResult {
  const [vms, setVMs] = useState<IVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAllVMsAdmin(filters);
      setVMs(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500 ? 'Service temporarily unavailable.' : err.message
          : 'Failed to load VMs.'
      );
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.cloneType, filters?.node]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return { vms, loading, error, refetch: load };
}
