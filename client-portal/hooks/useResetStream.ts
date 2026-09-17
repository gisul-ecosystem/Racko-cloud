'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { issueResetStreamTicket, openResetStatusStreamWithReconnect } from '../lib/machineManagerApi';

export type ResetStatus = 'pending' | 'success' | 'failed';

interface ResetState {
  status: ResetStatus;
  error?: string;
}

/**
 * Opens a per-machine reset SSE stream when status is 'pending'.
 * Mirrors useJobStream — component-local state updated directly from SSE,
 * no full machine list refetch needed for live status updates.
 *
 * When reset completes (success/failed), calls onComplete so the parent
 * can refetch the machine list once to sync DB state.
 */
export function useResetStream(
  sessionId: string,
  initialStatus: ResetStatus,
  onComplete: () => void,
): ResetState {
  const [state, setState] = useState<ResetState>({ status: initialStatus });
  const stopRef = useRef<(() => void) | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    // If already terminal, no stream needed
    if (initialStatus !== 'pending') {
      setState({ status: initialStatus });
      return;
    }

    setState({ status: 'pending' });

    let disposed = false;
    let attempt = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      void (async () => {
        try {
          const { streamToken } = await issueResetStreamTicket(sessionId);
          if (disposed) return;

          const stop = openResetStatusStreamWithReconnect(
            sessionId,
            streamToken,
            (event) => {
              if (event.type === 'reset_complete') {
                const nextStatus: ResetStatus = event.success ? 'success' : 'failed';
                setState({ status: nextStatus, error: event.error });
                onCompleteRef.current();
              }
            },
            () => { stopRef.current = null; },
            () => {
              // All retries exhausted — mark failed, sync DB
              if (!disposed) {
                setState({ status: 'failed', error: 'Connection lost — reset may have completed. Check machine status.' });
                onCompleteRef.current();
              }
            },
            1,
          );

          stopRef.current = stop;
          attempt = 0;
        } catch {
          if (!disposed) {
            const delay = Math.min(2000 * Math.pow(2, attempt), 30_000);
            attempt++;
            retryTimeout = setTimeout(connect, delay);
          }
        }
      })();
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      stopRef.current?.();
      stopRef.current = null;
    };
  // Only re-run when sessionId changes (new reset) or initialStatus transitions away from pending
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, initialStatus]);

  return state;
}
