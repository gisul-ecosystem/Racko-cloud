'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { getMicrosoftLicenses } from '../api/client';
import type { MicrosoftLicense } from '../types/catalog';

export function useMicrosoftLicenses(enabled = true) {
  const [licenses, setLicenses] = useState<MicrosoftLicense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setLicenses([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await getMicrosoftLicenses();
      setLicenses(next);
    } catch (err) {
      setLicenses([]);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load Microsoft licenses from the tenant.'
      );
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { licenses, loading, error, refetch };
}
