'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAvailableRegions } from '../api/client';
import { ApiError } from '../../lib/apiClient';
import { buildInstanceSelectionsParam } from '../utils/requestForm';

export function useAvailableRegions(serviceIds, selectedInstances) {
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const serviceKey = serviceIds.join(',');
  const instanceKey = buildInstanceSelectionsParam(selectedInstances) ?? '';

  const load = useCallback(async () => {
    if (serviceIds.length === 0) {
      setRegions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getAvailableRegions(serviceIds, instanceKey || undefined);
      setRegions(result);
    } catch (err) {
      setRegions([]);
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'Failed to load regions from AWS.'
            : err.message
          : 'Failed to load regions from AWS.'
      );
    } finally {
      setLoading(false);
    }
  }, [serviceIds, serviceKey, instanceKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { regions, loading, error };
}
