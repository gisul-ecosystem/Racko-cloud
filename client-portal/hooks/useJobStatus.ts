'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchJobStatus, type IVMJob, type JobVMCredential } from '../lib/vmApi';
import { ApiError } from '../lib/apiClient';

const TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed']);
const POLL_INTERVAL_MS = 3000;

interface UseJobStatusResult {
  job: IVMJob | null;
  vms: JobVMCredential[];
  loading: boolean;
  error: string | null;
}

export function useJobStatus(jobId: string | null): UseJobStatusResult {
  const [job, setJob] = useState<IVMJob | null>(null);
  const [vms, setVms] = useState<JobVMCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const result = await fetchJobStatus(jobId);
      setJob(result.job);
      setVms(result.vms);
      setError(null);
      // Stop polling once terminal
      if (TERMINAL_STATUSES.has(result.job.status)) {
        if (intervalRef.current) clearInterval(intervalRef.current);
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

  return { job, vms, loading, error };
}
