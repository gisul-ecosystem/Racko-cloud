'use client';

import { useEffect, useState } from 'react';
import { getAvailableLocations } from '../api/client';
import { ApiError } from '../../lib/apiClient';
import type { AvailableLocation } from '../types/catalog';
import { buildInstanceSelectionsParam } from '../utils/requestForm';

interface UseAvailableLocationsResult {
  locations: AvailableLocation[];
  loading: boolean;
  error: string | null;
}

export function useAvailableLocations(
  serviceIds: number[],
  selectedInstances: { serviceId: number; instanceOption: string }[]
): UseAvailableLocationsResult {
  const [locations, setLocations] = useState<AvailableLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serviceKey = serviceIds.join(',');
  const instanceKey = buildInstanceSelectionsParam(selectedInstances) ?? '';

  useEffect(() => {
    if (serviceIds.length === 0) {
      setLocations([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const instanceSelections = instanceKey || undefined;
          const result = await getAvailableLocations(serviceIds, instanceSelections);
          setLocations(result);
        } catch (err) {
          setLocations([]);
          setError(
            err instanceof ApiError
              ? err.status >= 500
                ? 'Failed to load regions.'
                : err.message
              : 'Failed to load regions.'
          );
        } finally {
          setLoading(false);
        }
      })();
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [serviceIds, serviceKey, instanceKey]);

  return { locations, loading, error };
}
