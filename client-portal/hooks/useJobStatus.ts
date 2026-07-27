'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchJobStatus, cancelJob, type IVMJob, type JobVMCredential } from '../lib/vmApi';
import { ApiError } from '../lib/apiClient';

const TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'cancelled']);
const POLL_INTERVAL_MS = 3000;

interface UseJobStatusResult {
  job: IVMJob | null;
  vms: JobVMCredential[];
  loading: boolean;
  error: string | null;
  cancelling: boolean;
  cancel: () => Promise<void>;
}

export function useJobStatus(jobId: string | null): UseJobStatusResult {
  const [job, setJob] = useState<IVMJob | null>(null);
  const [vms, setVms] = useState<JobVMCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const result = await fetchJobStatus(jobId);
      setJob(result.job);
      setVms(result.vms);
      setError(null);
      // Stop polling once terminal (including cancelled)
      if (TERMINAL_STATUSES.has(result.job.status)) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setCancelling(false);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500 ? 'Service temporarily unavailable.' : err.message
          : 'Failed to load job status.'
      );
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    void poll();
    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll, jobId]);

  const cancel = useCallback(async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      await cancelJob(jobId);
      // Optimistically update local state; poll will sync the real status shortly
      setJob((prev) => prev ? { ...prev, status: 'cancelling' } : prev);
    } catch (err) {
      setCancelling(false);
      setError(
        err instanceof ApiError ? err.message : 'Failed to cancel job.'
      );
    }
  }, [jobId, cancelling]);

  return { job, vms, loading, error, cancelling, cancel };
}
