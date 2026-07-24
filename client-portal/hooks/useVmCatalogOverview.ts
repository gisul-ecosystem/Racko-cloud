'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVmCatalogPortal } from '../context/VmCatalogPortalContext';
import type { CatalogVmOverview } from '../lib/vmCatalogApi';
import { ApiError } from '../lib/apiClient';

interface UseVmCatalogOverviewResult {
  overview: CatalogVmOverview | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useVmCatalogOverview(enabled = true): UseVmCatalogOverviewResult {
  const { api, isReady } = useVmCatalogPortal();
  const [overview, setOverview] = useState<CatalogVmOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.fetchOverview();
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
  }, [api]);

  useEffect(() => {
    if (enabled && isReady) void load();
  }, [load, enabled, isReady]);

  return { overview, loading, error, refetch: load };
}
