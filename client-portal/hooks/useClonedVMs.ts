'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchClonedVMs, type ClonedVM } from '../lib/vmApi';
import { ApiError } from '../lib/apiClient';

interface UseClonedVMsResult {
  vms: ClonedVM[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useClonedVMs(isAuthenticated: boolean): UseClonedVMsResult {
  const [vms, setVMs] = useState<ClonedVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchClonedVMs();
      setVMs(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500 ? 'Service temporarily unavailable.' : err.message
          : 'Failed to load cloned VMs.'
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
