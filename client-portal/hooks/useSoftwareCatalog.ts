'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchSoftwareCatalog, type ISoftwareCatalog } from '../lib/machineManagerApi';
import { ApiError } from '../lib/apiClient';

interface UseSoftwareCatalogResult {
  catalog: ISoftwareCatalog[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSoftwareCatalog(isAuthenticated: boolean): UseSoftwareCatalogResult {
  const [catalog, setCatalog] = useState<ISoftwareCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSoftwareCatalog();
      setCatalog(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'Service temporarily unavailable.'
            : err.message
          : 'Failed to load software catalog.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return { catalog, loading, error, refetch: load };
}
