'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listRequests } from '../api/client';
import { categorizeRequestStatus } from '../utils/formatters';
import type { ProvisioningRequest, RequestStats } from '../types';
import { ApiError } from '../../lib/apiClient';

interface UseProvisioningRequestsResult {
  requests: ProvisioningRequest[];
  stats: RequestStats;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function computeStats(requests: ProvisioningRequest[]): RequestStats {
  const stats: RequestStats = {
    total: requests.length,
    completed: 0,
    provisioning: 0,
    expired: 0,
  };

  for (const request of requests) {
    const category = categorizeRequestStatus(request.status ?? '');
    if (category === 'completed') stats.completed += 1;
    else if (category === 'provisioning') stats.provisioning += 1;
    else if (category === 'expired') stats.expired += 1;
  }

  return stats;
}

export function useProvisioningRequests(isAuthenticated: boolean): UseProvisioningRequestsResult {
  const [requests, setRequests] = useState<ProvisioningRequest[]>([]);
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
            ? 'Cloud automation service temporarily unavailable.'
            : err.message
          : 'Failed to load provisioning requests.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      setRequests([]);
      setError(null);
      return;
    }
    void load();
  }, [load, isAuthenticated]);

  const stats = useMemo(() => computeStats(requests), [requests]);

  return { requests, stats, loading, error, refetch: load };
}
