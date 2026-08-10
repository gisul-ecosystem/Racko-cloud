'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getProvisionStatus, type GcpProvisionStatus } from '../api/client';

export function useGcpProvisionStatus(requestId: string | null, enabled = true) {
  const [status, setStatus] = useState<GcpProvisionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getProvisionStatus(requestId);
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provision status');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (!enabled || !requestId) return undefined;
    void load();

    timerRef.current = setInterval(() => {
      void load();
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, load, requestId]);

  return { status, loading, error, refetch: load };
}
