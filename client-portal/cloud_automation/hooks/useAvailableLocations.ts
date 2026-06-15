'use client';

import { useCallback, useEffect, useState } from 'react';
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

  const load = useCallback(async () => {
    if (serviceIds.length === 0) {
      setLocations([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
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
  }, [serviceIds, serviceKey, instanceKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { locations, loading, error };
}
