'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listRequests, type AwsRequest } from '../api/client';
import { ApiError } from '../../lib/apiClient';

export interface AwsRequestStats {
  total: number;
  completed: number;
  provisioning: number;
  expired: number;
}

interface UseAwsRequestsResult {
  requests: AwsRequest[];
  stats: AwsRequestStats;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function computeStats(requests: AwsRequest[]): AwsRequestStats {
  const stats: AwsRequestStats = {
    total: requests.length,
    completed: 0,
    provisioning: 0,
    expired: 0,
  };

  for (const request of requests) {
    const status = (request.status ?? '').toLowerCase();
    if (status === 'completed') stats.completed += 1;
    else if (['pending', 'provisioning', 'processing'].includes(status)) stats.provisioning += 1;
    else if (['expired', 'cancelled', 'failed'].includes(status)) stats.expired += 1;
  }

  return stats;
}

export function useAwsRequests(isAuthenticated: boolean): UseAwsRequestsResult {
  const [requests, setRequests] = useState<AwsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listRequests();
      setRequests(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'AWS automation service temporarily unavailable.'
            : err.message
          : 'Failed to load provisioning requests.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  const stats = useMemo(() => computeStats(requests), [requests]);

  return { requests, stats, loading, error, refetch: load };
}
