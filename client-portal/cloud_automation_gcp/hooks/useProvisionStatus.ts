'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import {
  getProvisionStatus,
  retryProvision,
  startProvision,
  type GcpProvisionStatus,
} from '../api/client';

const POLL_INTERVAL_MS = 5000;

interface UseGcpProvisionStatusResult {
  status: GcpProvisionStatus | null;
  loading: boolean;
  error: string | null;
  starting: boolean;
  isComplete: boolean;
  isFailed: boolean;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useGcpProvisionStatus(
  requestId: string | null,
  enabled = true,
  autoStart = true
): UseGcpProvisionStatusResult {
  const [status, setStatus] = useState<GcpProvisionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const loadStatus = useCallback(async () => {
    if (!requestId) {
      throw new Error('Invalid request ID.');
    }

    const next = await getProvisionStatus(requestId);
    setStatus(next);
    setError(null);
    return next;
  }, [requestId]);

  const refresh = useCallback(async () => {
    if (!requestId || !enabled) return;

    try {
      setLoading((current) => current && !status);
      await loadStatus();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load provisioning status.'
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, loadStatus, requestId, status]);

  const retry = useCallback(async () => {
    if (!requestId) return;

    setStarting(true);
    setError(null);
    try {
      await retryProvision(requestId);
      await loadStatus();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to retry provisioning.'
      );
    } finally {
      setStarting(false);
    }
  }, [loadStatus, requestId]);

  useEffect(() => {
    if (!enabled || !requestId) return undefined;

    const bootstrap = async () => {
      try {
        const next = await loadStatus();

        if (autoStart && !startedRef.current && next.status === 'Pending') {
          startedRef.current = true;
          setStarting(true);
          try {
            await startProvision(requestId);
            await loadStatus();
          } finally {
            setStarting(false);
          }
        }
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to initialize provisioning.'
        );
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();

    pollRef.current = setInterval(() => {
      void loadStatus().catch(() => undefined);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [autoStart, enabled, loadStatus, requestId]);

  useEffect(() => {
    if (status && ['Completed', 'Failed', 'Expired'].includes(status.status)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [status]);

  return {
    status,
    loading,
    error,
    starting,
    isComplete: status?.status === 'Completed',
    isFailed: status?.status === 'Failed',
    refresh,
    retry,
  };
}
