'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchFullClusterData, type FullClusterData } from '../lib/proxmoxApi';
import { ApiError } from '../lib/apiClient';

interface UseClusterDataResult {
  data: FullClusterData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useClusterData(isAuthenticated: boolean, isLoading: boolean): UseClusterDataResult {
  const [data, setData] = useState<FullClusterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFullClusterData();
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        // Never expose internal details — use safe message
        setError(err.status >= 500
          ? 'Infrastructure service is temporarily unavailable.'
          : err.message
        );
      } else {
        setError('Failed to load cluster data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      void fetch();
    }
  }, [fetch, isAuthenticated, isLoading]);

  return { data, loading, error, refetch: fetch };
}
