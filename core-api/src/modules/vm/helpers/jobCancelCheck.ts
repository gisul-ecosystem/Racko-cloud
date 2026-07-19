import mongoose from 'mongoose';
import { VMJob } from '../vmJob.model';
import { logger } from '../../../utils/logger';

/**
 * Returns true if the job has been marked for cancellation.
 * Called at the start of each batch iteration so processors stop
 * queuing new work without interrupting in-flight Proxmox tasks.
 */
export async function isCancelling(jobId: mongoose.Types.ObjectId): Promise<boolean> {
  const job = await VMJob.findById(jobId).select('status').lean();
  return job?.status === 'cancelling';
}

/**
 * Finalise a cancelled job — writes the terminal 'cancelled' status
 * (or 'partial' if some VMs completed before cancel was hit).
 */
export async function finalizeCancelledJob(jobId: mongoose.Types.ObjectId): Promise<void> {
  const job = await VMJob.findById(jobId).lean();
  if (!job) return;

  const finalStatus = job.completed > 0 ? 'partial' : 'cancelled';

  await VMJob.findByIdAndUpdate(jobId, {
    status: finalStatus,
    completedAt: new Date(),
  });

  logger.info('[JobCancel] Job cancelled', {
    jobId: jobId.toString(),
    finalStatus,
    completed: job.completed,
    failed: job.failed,
    pending: job.pending,
  });
}
