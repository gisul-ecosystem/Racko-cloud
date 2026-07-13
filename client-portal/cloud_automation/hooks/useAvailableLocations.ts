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

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1500;

async function fetchLocationsWithRetry(
  serviceIds: number[],
  instanceSelections?: string
): Promise<AvailableLocation[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await getAvailableLocations(serviceIds, instanceSelections);
    } catch (error) {
      lastError = error;
      const shouldRetry =
        attempt < MAX_ATTEMPTS &&
        (error instanceof ApiError ? error.status >= 500 || error.status === 503 : true);

      if (!shouldRetry) {
        break;
      }

      await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  throw lastError;
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
          const result = await fetchLocationsWithRetry(serviceIds, instanceSelections);
          setLocations(result);
        } catch (err) {
          setLocations([]);
          setError(
            err instanceof ApiError
              ? err.status >= 500
                ? 'Failed to load regions. Azure may still be checking VM availability — try again in a moment.'
                : err.message
              : 'Failed to load regions. Azure may still be checking VM availability — try again in a moment.'
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
