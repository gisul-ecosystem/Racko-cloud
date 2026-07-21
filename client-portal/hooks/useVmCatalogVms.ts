'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVmCatalogPortal } from '../context/VmCatalogPortalContext';
import type { ICatalogVm } from '../lib/vmCatalogApi';
import { ApiError } from '../lib/apiClient';

interface UseVmCatalogVmsResult {
  vms: ICatalogVm[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useVmCatalogVms(enabled = true): UseVmCatalogVmsResult {
  const { api, isReady } = useVmCatalogPortal();
  const [vms, setVms] = useState<ICatalogVm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.fetchVms();
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
  }, [api]);

  useEffect(() => {
    if (enabled && isReady) void load();
  }, [load, enabled, isReady]);

  return { vms, loading, error, refetch: load };
}
