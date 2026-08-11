'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAdminMyVmDashboard, type MyVmDashboardRow } from '@/lib/myVmDashboardApi';

export function useAdminMyVmDashboard(isAuthenticated: boolean) {
  const [rows, setRows] = useState<MyVmDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminMyVmDashboard();
      setRows(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load VM dashboard.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, refetch: load };
}
