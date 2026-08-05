'use client';

import { useEffect, useRef, useState } from 'react';
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
const RETRY_DELAY_MS = 800;
const DEBOUNCE_MS = 150;

async function fetchLocationsWithRetry(
  serviceIds: number[],
  instanceSelections?: string,
  signal?: AbortSignal
): Promise<AvailableLocation[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      return await getAvailableLocations(serviceIds, instanceSelections);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const shouldRetry =
        attempt < MAX_ATTEMPTS &&
        (error instanceof ApiError
          ? error.status >= 500 || error.status === 0 || error.status === 503
          : true);

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
  const requestIdRef = useRef(0);

  const serviceKey = serviceIds.join(',');
  const instanceKey = buildInstanceSelectionsParam(selectedInstances) ?? '';

  useEffect(() => {
    if (serviceIds.length === 0) {
      requestIdRef.current += 1;
      setLocations([]);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const abortController = new AbortController();
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const instanceSelections = instanceKey || undefined;
          const result = await fetchLocationsWithRetry(
            serviceIds,
            instanceSelections,
            abortController.signal
          );
          if (requestIdRef.current !== requestId) return;
          setLocations(result);
          setError(null);
        } catch (err) {
          if (requestIdRef.current !== requestId) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;

          setLocations([]);
          setError(
            err instanceof ApiError
              ? err.status >= 500 || err.status === 0
                ? 'Failed to load regions for the selected instance. Try again in a moment.'
                : err.message
              : 'Failed to load regions for the selected instance. Try again in a moment.'
          );
        } finally {
          if (requestIdRef.current === requestId) {
            setLoading(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [serviceIds, serviceKey, instanceKey]);

  return { locations, loading, error };
}
