'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchMyUsers, type ManagedUserProfile } from '../lib/managedUsersApi';
import { ApiError } from '../lib/apiClient';

interface UseManagedUsersResult {
  users: ManagedUserProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useManagedUsers(isAuthenticated: boolean): UseManagedUsersResult {
  const [users, setUsers] = useState<ManagedUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMyUsers();
      setUsers(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500 ? 'Service temporarily unavailable.' : err.message
          : 'Failed to load users.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return { users, loading, error, refetch: load };
}
