import type { Request } from 'express';
import mongoose from 'mongoose';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { VM } from '../vm.model';
import { VMJob } from '../vmJob.model';
import { VMOperationError } from '../../../utils/errors';
import type { IVMJob } from '../vmJob.model';
import type { UserRole } from '../../../types';
import { notificationService } from '../../notification/notification.service';
import { isCancelling, finalizeCancelledJob } from './jobCancelCheck';

type DeleteVMFn = (
  vmId: mongoose.Types.ObjectId,
  adminId: mongoose.Types.ObjectId,
  req: Request
) => Promise<void>;

function buildJobRequest(adminId: mongoose.Types.ObjectId, role: UserRole): Request {
  return {
    user: {
      userId: adminId.toString(),
      role,
      sessionId: 'bulk-delete-job',
    },
    headers: {
      'user-agent': 'racko-bulk-delete-job',
      'x-forwarded-for': 'internal',
    },
    ip: 'internal',
  } as unknown as Request;
}

function isAlreadyDeletedError(err: unknown): boolean {
  return err instanceof VMOperationError && err.message.includes('already deleted');
}

function isDeletionInProgressError(err: unknown): boolean {
  return err instanceof VMOperationError && err.message.includes('already in progress');
}

async function finalizeDeleteJobStatus(jobId: mongoose.Types.ObjectId): Promise<void> {
  const finalJob = await VMJob.findById(jobId).lean();
  if (!finalJob) return;

  let finalStatus: IVMJob['status'];
  if (finalJob.failed === 0) {
    finalStatus = 'completed';
  } else if (finalJob.completed === 0) {
    finalStatus = 'failed';
  } else {
    finalStatus = 'partial';
  }

  await VMJob.findByIdAndUpdate(jobId, {
    status: finalStatus,
    completedAt: new Date(),
  });

  logger.info('[VMDelete] Bulk delete job finished', {
    jobId: jobId.toString(),
    status: finalStatus,
    completed: finalJob.completed,
    failed: finalJob.failed,
  });
}

async function recordDeleteFailure(
  jobId: mongoose.Types.ObjectId,
  index: number,
  vmName: string,
  error: string,
  node?: string,
  vmid?: number
): Promise<void> {
  const push: Record<string, unknown> = {
    jobErrors: { index, vmName, error, node },
  };
  if (vmid !== undefined) {
    push['failedVmids'] = vmid;
  }

  await VMJob.findByIdAndUpdate(jobId, {
    $inc: { failed: 1, pending: -1 },
    $push: push,
  });
}

async function deleteSingleVmInJob(
  jobId: mongoose.Types.ObjectId,
  vmId: mongoose.Types.ObjectId,
  index: number,
  total: number,
  adminId: mongoose.Types.ObjectId,
  req: Request,
  deleteVM: DeleteVMFn
): Promise<void> {
  const vm = await VM.findById(vmId).select('name vmid node status').lean();

  if (!vm) {
    await recordDeleteFailure(jobId, index, `VM ${vmId.toString()}`, 'VM not found.', undefined);
    return;
  }

  try {
    await deleteVM(vmId, adminId, req);

    await VMJob.findByIdAndUpdate(jobId, {
      $inc: { completed: 1, pending: -1 },
      $push: { vmIds: vmId },
    });

    logger.info('[VMDelete] Bulk delete item succeeded', {
      jobId: jobId.toString(),
      vmId: vmId.toString(),
      vmid: vm.vmid,
      index: index + 1,
      total,
    });
  } catch (err) {
    if (isAlreadyDeletedError(err)) {
      await VMJob.findByIdAndUpdate(jobId, {
        $inc: { completed: 1, pending: -1 },
        $push: { vmIds: vmId },
      });
      logger.info('[VMDelete] Bulk delete item skipped — already deleted', {
        jobId: jobId.toString(),
        vmId: vmId.toString(),
        vmid: vm.vmid,
      });
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    await recordDeleteFailure(jobId, index, vm.name, message, vm.node, vm.vmid);

    logger.warn('[VMDelete] Bulk delete item failed', {
      jobId: jobId.toString(),
      vmId: vmId.toString(),
      vmid: vm.vmid,
      node: vm.node,
      error: message,
      inProgress: isDeletionInProgressError(err),
    });
  }
}

/**
 * Process bulk VM deletion asynchronously.
 * VMs are deleted in batches (VM_BULK_DELETE_BATCH_SIZE); per-node destroy
 * concurrency is still capped by VM_DELETE_MAX_CONCURRENT_PER_NODE in deleteQueue.
 */
export async function processBulkDeletion(
  job: IVMJob,
  adminId: mongoose.Types.ObjectId,
  role: UserRole,
  deleteVM: DeleteVMFn
): Promise<void> {
  const jobId = job._id;
  const targetVmIds = job.targetVmIds ?? [];
  const batchSize = config.VM_BULK_DELETE_BATCH_SIZE;

  const batches: mongoose.Types.ObjectId[][] = [];
  for (let i = 0; i < targetVmIds.length; i += batchSize) {
    batches.push(targetVmIds.slice(i, i + batchSize));
  }

  logger.info('[VMDelete] Bulk delete job started', {
    jobId: jobId.toString(),
    total: targetVmIds.length,
    batches: batches.length,
    batchSize,
    adminId: adminId.toString(),
  });

  try {
    await VMJob.findByIdAndUpdate(jobId, { status: 'processing' });
    void notificationService.notifyJobStarted(jobId);

    const req = buildJobRequest(adminId, role);

    for (const batch of batches) {
      // Check for cancellation before starting each batch
      if (await isCancelling(jobId)) {
        logger.info('[VMDelete] Cancellation detected — stopping batch loop', {
          jobId: jobId.toString(),
          remainingBatches: batches.length - batches.indexOf(batch),
        });
        await finalizeCancelledJob(jobId);
        void notificationService.notifyJobFinished(jobId);
        return;
      }

      const batchStartIndex = targetVmIds.indexOf(batch[0]!);

      await Promise.all(
        batch.map((vmId, batchOffset) =>
          deleteSingleVmInJob(
            jobId,
            vmId,
            batchStartIndex + batchOffset,
            targetVmIds.length,
            adminId,
            req,
            deleteVM
          )
        )
      );
    }

    await finalizeDeleteJobStatus(jobId);
    void notificationService.notifyJobFinished(jobId);
  } catch (err) {
    logger.error('[VMDelete] Bulk delete job crashed', {
      jobId: jobId.toString(),
      error: err instanceof Error ? err.message : String(err),
    });

    await VMJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      completedAt: new Date(),
    });
    void notificationService.notifyJobFinished(jobId);
  }
}
