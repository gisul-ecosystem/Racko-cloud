'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listRequests, type GcpRequest } from '../api/client';
import { ApiError } from '../../lib/apiClient';

export interface GcpRequestStats {
  total: number;
  completed: number;
  provisioning: number;
  expired: number;
}

export function useGcpRequests(isAuthenticated: boolean) {
  const [requests, setRequests] = useState<GcpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await listRequests());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'GCP automation service temporarily unavailable.'
            : err.message
          : 'Failed to load GCP requests.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      setRequests([]);
      return;
    }
    void load();
  }, [isAuthenticated, load]);

  const stats = useMemo((): GcpRequestStats => {
    const result = { total: requests.length, completed: 0, provisioning: 0, expired: 0 };
    for (const request of requests) {
      const status = String(request.status ?? '').toLowerCase();
      if (status === 'completed') result.completed += 1;
      else if (['pending', 'provisioning'].includes(status)) result.provisioning += 1;
      else if (['expired', 'failed'].includes(status)) result.expired += 1;
    }
    return result;
  }, [requests]);

  return { requests, stats, loading, error, refetch: load };
}
