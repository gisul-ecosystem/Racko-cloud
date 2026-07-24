import { ApiError } from './apiClient';

const TERMINAL = new Set(['completed', 'partial', 'failed']);
const POLL_MS = 2000;
const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes safety cap

export interface BulkAssignJobStatus {
  id: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  errorMessage?: string;
}

export interface BulkAssignJobPollPayload<TPair> {
  job: BulkAssignJobStatus;
  assigned: number;
  failed: number;
  pairs: TPair[];
}

/**
 * Poll until a bulk-assign job reaches a terminal status.
 * Mirrors the VMJob fire-and-forget + poll pattern used elsewhere.
 */
export async function pollBulkAssignJob<TPair>(
  fetchStatus: () => Promise<BulkAssignJobPollPayload<TPair>>
): Promise<BulkAssignJobPollPayload<TPair>> {
  const started = Date.now();

  for (;;) {
    if (Date.now() - started > MAX_WAIT_MS) {
      throw new ApiError('Bulk assign job timed out. Check assignments and try again.', 504);
    }

    const data = await fetchStatus();
    if (TERMINAL.has(data.job.status)) {
      if (data.job.status === 'failed' && data.pairs.length === 0 && data.job.errorMessage) {
        throw new ApiError(data.job.errorMessage, 500);
      }
      return data;
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
