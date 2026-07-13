'use client';

import { useCallback, useEffect, useState } from 'react';
import { getServices } from '../api/client';
import { ApiError } from '../../lib/apiClient';
import type { ServiceCatalogResponse } from '../types/catalog';

interface UseServiceCatalogResult {
  catalog: ServiceCatalogResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useServiceCatalog(enabled = true): UseServiceCatalogResult {
  const [catalog, setCatalog] = useState<ServiceCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getServices();
      setCatalog(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'Cloud automation service temporarily unavailable.'
            : err.message
          : 'Failed to load service catalog.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      setCatalog(null);
      return;
    }
    void load();
  }, [enabled, load]);

  return { catalog, loading, error, refetch: load };
}
