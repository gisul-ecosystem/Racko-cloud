'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchMachines, type IMachine } from '../lib/machineManagerApi';
import { ApiError } from '../lib/apiClient';

interface UseMachinesResult {
  machines: IMachine[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMachines(isAuthenticated: boolean): UseMachinesResult {
  const [machines, setMachines] = useState<IMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMachines();
      setMachines(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'Service temporarily unavailable.'
            : err.message
          : 'Failed to load machines.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return { machines, loading, error, refetch: load };
}
