'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchExternalVMs, type IExternalVM } from '../lib/externalVmApi';
import { ApiError } from '../lib/apiClient';

interface UseExternalVMsResult {
  vms: IExternalVM[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExternalVMs(isAuthenticated: boolean): UseExternalVMsResult {
  const [vms, setVMs] = useState<IExternalVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchExternalVMs();
      setVMs(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'Service temporarily unavailable.'
            : err.message
          : 'Failed to load external servers.'
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
