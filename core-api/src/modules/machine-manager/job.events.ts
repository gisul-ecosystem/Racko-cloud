import { EventEmitter } from 'events';
import type { JobStatus } from './machine-manager.model';
import { logger } from '../../utils/logger';

export interface JobStatusEvent {
  jobId: string;
  status: JobStatus;
  logs: string;
  attempts: number;
  softwareId: string;
}

class JobStatusEmitter extends EventEmitter {}

export const jobStatusEmitter = new JobStatusEmitter();

// One SSE listener per active job — allow up to 500 concurrent
jobStatusEmitter.setMaxListeners(500);

export function emitJobStatusEvent(jobId: string, event: JobStatusEvent): void {
  logger.info('[SSE][Jobs] Emitting job status event', {
    jobId,
    status: event.status,
    listenerCount: jobStatusEmitter.listenerCount(jobId),
  });
  jobStatusEmitter.emit(jobId, event);
}
