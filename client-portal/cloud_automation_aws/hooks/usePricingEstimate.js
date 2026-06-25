'use client';

import { useEffect, useRef, useState } from 'react';
import { calculatePricingEstimate } from '../api/client';

export function usePricingEstimate(payload, debounceMs = 400) {
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (
      !payload ||
      !payload.selectedServiceIds?.length ||
      !payload.region ||
      !payload.accountCount ||
      !payload.durationDays
    ) {
      setEstimate(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const result = await calculatePricingEstimate({
            serviceIds: payload.selectedServiceIds,
            region: payload.region,
            accountCount: payload.accountCount,
            durationDays: payload.durationDays,
            instanceSelections: payload.selectedInstances ?? [],
          });
          setEstimate(result);
          setError(null);
        } catch (err) {
          setEstimate(null);
          setError(err?.message || 'Failed to calculate pricing estimate.');
        } finally {
          setLoading(false);
        }
      })();
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [payload, debounceMs]);

  return { estimate, loading, error };
}
