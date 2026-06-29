'use client';

import { useEffect, useRef, useState } from 'react';
import { calculatePricingEstimate } from '../api/client';

/**
 * Live pricing estimate for the AWS create-request wizard.
 * Uses the backend pricing API when region + services are available,
 * with a client-side fallback for flat-rate services.
 */
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
      !payload.accountCount ||
      !payload.durationDays ||
      !payload.startDate ||
      !payload.endDate
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
          const region = payload.region;
          if (region) {
            const result = await calculatePricingEstimate({
              serviceIds: payload.selectedServiceIds,
              region,
              accountCount: payload.accountCount,
              durationDays: payload.durationDays,
              instanceSelections: payload.selectedInstances ?? [],
            });
            setEstimate(result);
            setError(null);
            return;
          }

          let total = 0;
          const breakdown = [];
          for (const svc of payload.selectedServices ?? []) {
            const line = payload.selectedInstances?.find((entry) => entry.serviceId === svc._id);
            const pricePerDay = svc.pricePerDay ?? 0;
            const isInstance = svc.pricingType === 'instance';
            const cost = isInstance
              ? pricePerDay * (payload.accountCount ?? 1) * payload.durationDays
              : pricePerDay * payload.durationDays;

            breakdown.push({
              serviceName: svc.name,
              instanceType: line?.instanceType ?? svc.name,
              pricePerDay,
              flatRate: !isInstance,
              accountCount: payload.accountCount,
              durationDays: payload.durationDays,
              cost,
            });
            total += cost;
          }

          setEstimate({ total, breakdown });
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
