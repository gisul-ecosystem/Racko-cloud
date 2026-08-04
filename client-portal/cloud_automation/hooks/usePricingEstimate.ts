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

function isPayloadReady(payload: PricingEstimatePayload | null): payload is PricingEstimatePayload {
  return Boolean(
    payload &&
      payload.serviceIds.length > 0 &&
      payload.location &&
      payload.startDate &&
      payload.endDate &&
      payload.accountCount > 0
  );
}

function stablePayloadKey(payload: PricingEstimatePayload | null): string {
  if (!isPayloadReady(payload)) return '';
  return JSON.stringify({
    accountCount: payload.accountCount,
    serviceIds: payload.serviceIds,
    location: payload.location,
    startDate: payload.startDate,
    endDate: payload.endDate,
    selectedInstances: payload.selectedInstances,
    selectedRoles: payload.selectedRoles,
    costingMode: payload.costingMode ?? null,
    usageWindows: payload.usageWindows ?? [],
  });
}

export function usePricingEstimate(
  payload: PricingEstimatePayload | null,
  debounceMs = 400
): UsePricingEstimateResult {
  const [pricing, setPricing] = useState<PricingEstimateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const latestPayloadRef = useRef(payload);
  latestPayloadRef.current = payload;

  const payloadKey = stablePayloadKey(payload);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!payloadKey) {
      setPricing(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);

    timerRef.current = setTimeout(() => {
      void (async () => {
        const currentPayload = latestPayloadRef.current;
        if (!isPayloadReady(currentPayload) || stablePayloadKey(currentPayload) !== payloadKey) {
          if (requestIdRef.current === requestId) {
            setLoading(false);
          }
          return;
        }

        try {
          const result = await calculatePricingEstimate(currentPayload);
          if (requestIdRef.current !== requestId) return;
          setPricing(result);
          setError(null);
        } catch (err) {
          if (requestIdRef.current !== requestId) return;
          setPricing(null);
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to calculate pricing estimate.'
          );
        } finally {
          if (requestIdRef.current === requestId) {
            setLoading(false);
          }
        }
      })();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [payloadKey, debounceMs]);

  return { pricing, loading, error };
}
