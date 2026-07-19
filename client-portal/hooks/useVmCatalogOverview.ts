'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchVmCatalogOverview, type CatalogVmOverview } from '../lib/vmCatalogApi';
import { ApiError } from '../lib/apiClient';

interface UseVmCatalogOverviewResult {
  overview: CatalogVmOverview | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useVmCatalogOverview(isAuthenticated: boolean): UseVmCatalogOverviewResult {
  const [overview, setOverview] = useState<CatalogVmOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchVmCatalogOverview();
      setOverview(result);
    } catch (err) {
      setOverview(null);
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'Service temporarily unavailable.'
            : err.message
          : 'Failed to load VM catalog overview.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return { overview, loading, error, refetch: load };
}
