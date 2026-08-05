'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import {
  getProvisionStatus,
  retryProvision,
  startProvision,
} from '../api/client';

const POLL_INTERVAL_MS = 5000;

export type ProvisionStepState = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface ProvisionStep {
  key: string;
  label: string;
  step: number;
  state: ProvisionStepState;
}

export interface ProvisionLogEntry {
  step: number;
  stepName?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string | null;
}

export interface ProvisionStatusSnapshot {
  status: string;
  currentStep: number;
  progress: number;
  message: string;
  steps: ProvisionStep[];
  awsAccountId?: string | null;
  credentialsSent?: boolean;
  spreadsheetAvailable?: boolean;
  guideAvailable?: boolean;
  failureReason?: string | null;
  logs?: ProvisionLogEntry[];
}

interface UseProvisionStatusOptions {
  requestId: string;
  autoStart?: boolean;
}

interface UseProvisionStatusResult {
  snapshot: ProvisionStatusSnapshot | null;
  loading: boolean;
  error: string | null;
  isComplete: boolean;
  isFailed: boolean;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  starting: boolean;
}

export function useProvisionStatus({
  requestId,
  autoStart = true,
}: UseProvisionStatusOptions): UseProvisionStatusResult {
  const [snapshot, setSnapshot] = useState<ProvisionStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const loadStatus = useCallback(async () => {
    const status = await getProvisionStatus(requestId);
    setSnapshot(status);
    setError(null);
    return status;
  }, [requestId]);

  const refresh = useCallback(async () => {
    if (!requestId) {
      setError('Invalid request ID.');
      setLoading(false);
      return;
    }

    try {
      setLoading((current) => current && !snapshot);
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
  }, [loadStatus, requestId, snapshot]);

  const retry = useCallback(async () => {
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
    if (!requestId) return;

    const bootstrap = async () => {
      try {
        const status = await loadStatus();

        if (
          autoStart &&
          !startedRef.current &&
          status.status === 'Pending'
        ) {
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
  }, [autoStart, loadStatus, requestId]);

  useEffect(() => {
    if (snapshot && ['Completed', 'Failed', 'Expired'].includes(snapshot.status)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [snapshot]);

  const isComplete = snapshot?.status === 'Completed';
  const isFailed = snapshot?.status === 'Failed';

  return {
    snapshot,
    loading,
    error,
    isComplete,
    isFailed,
    refresh,
    retry,
    starting,
  };
}
