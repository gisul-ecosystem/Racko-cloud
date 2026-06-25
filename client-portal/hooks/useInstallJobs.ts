'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchJobs, type IJob } from '../lib/machineManagerApi';
import { ApiError } from '../lib/apiClient';

interface UseInstallJobsResult {
  jobs: IJob[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useInstallJobs(isAuthenticated: boolean): UseInstallJobsResult {
  const [jobs, setJobs] = useState<IJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJobs();
      setJobs(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'Service temporarily unavailable.'
            : err.message
          : 'Failed to load jobs.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return { jobs, loading, error, refetch: load };
}
