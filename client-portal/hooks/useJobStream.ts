'use client';

import { useState, useEffect, useRef } from 'react';
import { issueJobStreamTicket, type IJob, type JobStatus } from '../lib/machineManagerApi';
import { getSseGatewayBaseUrl } from '../lib/gatewayUrl';

const TERMINAL: JobStatus[] = ['success', 'failed'];

/**
 * Opens an SSE stream for a single job and returns its live status.
 * Automatically reconnects with exponential backoff on disconnect.
 * Closes the stream once the job reaches a terminal state.
 */
export function useJobStream(initialJob: IJob, isAuthenticated: boolean): IJob {
  const [job, setJob] = useState<IJob>(initialJob);
  const sourceRef = useRef<EventSource | null>(null);

  // Keep in sync if parent re-fetches
  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (TERMINAL.includes(initialJob.status)) return; // already done, no stream needed

    let disposed = false;
    let attempt = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      void (async () => {
        try {
          const { streamToken } = await issueJobStreamTicket(initialJob._id);
          if (disposed) return;

          const url = `${getSseGatewayBaseUrl()}/api/v1/machines/jobs/${initialJob._id}/stream?streamToken=${encodeURIComponent(streamToken)}`;
          const source = new EventSource(url, { withCredentials: true });
          sourceRef.current = source;

          source.onopen = () => { attempt = 0; };

          source.onmessage = (e: MessageEvent<string>) => {
            try {
              const update = JSON.parse(e.data) as Partial<IJob>;
              setJob((prev) => ({ ...prev, ...update }));
              if (update.status && TERMINAL.includes(update.status)) {
                source.close();
              }
            } catch { /* ignore */ }
          };

          source.onerror = () => {
            source.close();
            sourceRef.current = null;
            if (!disposed) {
              const delay = Math.min(2000 * Math.pow(2, attempt), 30_000);
              attempt++;
              retryTimeout = setTimeout(connect, delay);
            }
          };
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
      sourceRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, initialJob._id]);

  return job;
}
