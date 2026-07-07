'use client';

import { useEffect, useRef, useState } from 'react';
import { calculatePricingEstimate } from '../api/client';
import { ApiError } from '../../lib/apiClient';
import type { PricingEstimatePayload, PricingEstimateResponse } from '../types/catalog';

interface UsePricingEstimateResult {
  pricing: PricingEstimateResponse | null;
  loading: boolean;
  error: string | null;
}

export function usePricingEstimate(
  payload: PricingEstimatePayload | null,
  debounceMs = 400
): UsePricingEstimateResult {
  const [pricing, setPricing] = useState<PricingEstimateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (
      !payload ||
      payload.serviceIds.length === 0 ||
      !payload.location ||
      !payload.startDate ||
      !payload.endDate ||
      payload.accountCount <= 0
    ) {
      setPricing(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const result = await calculatePricingEstimate(payload);
          setPricing(result);
          setError(null);
        } catch (err) {
          setPricing(null);
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to calculate pricing estimate.'
          );
        } finally {
          setLoading(false);
        }
      })();
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [payload, debounceMs]);

  return { pricing, loading, error };
}
