'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchVmCatalogVms, type ICatalogVm } from '../lib/vmCatalogApi';
import { ApiError } from '../lib/apiClient';

interface UseVmCatalogVmsResult {
  vms: ICatalogVm[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useVmCatalogVms(isAuthenticated: boolean): UseVmCatalogVmsResult {
  const [vms, setVms] = useState<ICatalogVm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchVmCatalogVms();
      setVms(result);
    } catch (err) {
      setVms([]);
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'Service temporarily unavailable.'
            : err.message
          : 'Failed to load catalog VMs.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return { vms, loading, error, refetch: load };
}
