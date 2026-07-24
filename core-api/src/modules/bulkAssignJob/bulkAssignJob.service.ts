import mongoose from 'mongoose';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import {
  BulkAssignJob,
  type BulkAssignJobKind,
  type IBulkAssignJob,
  type IBulkAssignPairRow,
} from './bulkAssignJob.model';

export interface StartBulkAssignJobInput {
  kind: BulkAssignJobKind;
  total: number;
  request: Record<string, unknown>;
  adminId?: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  createdByTenantUserId?: mongoose.Types.ObjectId;
}

export interface BulkAssignJobPublic {
  id: string;
  kind: BulkAssignJobKind;
  status: IBulkAssignJob['status'];
  total: number;
  completed: number;
  failed: number;
  pending: number;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

function toPublic(job: IBulkAssignJob): BulkAssignJobPublic {
  return {
    id: job._id.toString(),
    kind: job.kind,
    status: job.status,
    total: job.total,
    completed: job.completed,
    failed: job.failed,
    pending: job.pending,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage,
  };
}

function finalizeStatus(completed: number, failed: number, total: number): IBulkAssignJob['status'] {
  if (failed === 0 && completed === total) return 'completed';
  if (completed === 0 && failed > 0) return 'failed';
  if (failed > 0 && completed > 0) return 'partial';
  if (completed === 0 && failed === 0) return 'failed';
  return 'completed';
}

class BulkAssignJobService {
  /**
   * Create a pending job and kick off background work (do not await the work).
   * Same fire-and-forget pattern as VMJob + processBulkCreation.
   */
  async startJob(
    input: StartBulkAssignJobInput,
    run: (job: IBulkAssignJob) => Promise<{
      assigned: number;
      failed: number;
      pairs: IBulkAssignPairRow[];
    }>
  ): Promise<{ jobId: string }> {
    const job = await BulkAssignJob.create({
      kind: input.kind,
      status: 'pending',
      total: input.total,
      completed: 0,
      failed: 0,
      pending: input.total,
      adminId: input.adminId,
      tenantId: input.tenantId,
      createdByTenantUserId: input.createdByTenantUserId,
      request: input.request,
      pairs: [],
      startedAt: new Date(),
    });

    logger.info('[BulkAssignJob] Job created', {
      jobId: job._id.toString(),
      kind: job.kind,
      total: job.total,
    });

    void this.processJob(job._id, run);

    return { jobId: job._id.toString() };
  }

  private async processJob(
    jobId: mongoose.Types.ObjectId,
    run: (job: IBulkAssignJob) => Promise<{
      assigned: number;
      failed: number;
      pairs: IBulkAssignPairRow[];
    }>
  ): Promise<void> {
    try {
      const job = await BulkAssignJob.findById(jobId);
      if (!job) return;

      job.status = 'processing';
      await job.save();

      const result = await run(job);

      job.pairs = result.pairs;
      job.completed = result.assigned;
      job.failed = result.failed;
      job.pending = Math.max(0, job.total - result.assigned - result.failed);
      job.status = finalizeStatus(result.assigned, result.failed, job.total);
      job.completedAt = new Date();
      await job.save();

      logger.info('[BulkAssignJob] Job finished', {
        jobId: job._id.toString(),
        kind: job.kind,
        status: job.status,
        assigned: result.assigned,
        failed: result.failed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[BulkAssignJob] Job failed', {
        jobId: jobId.toString(),
        error: message,
      });

      await BulkAssignJob.findByIdAndUpdate(jobId, {
        $set: {
          status: 'failed',
          errorMessage: message,
          completedAt: new Date(),
          pending: 0,
        },
      });
    }
  }

  async getJobForAdmin(
    jobId: string,
    adminId: mongoose.Types.ObjectId,
    expectedKind: BulkAssignJobKind
  ): Promise<{ job: BulkAssignJobPublic; pairs: IBulkAssignPairRow[] }> {
    const job = await this.findOwnedJob(jobId);
    if (job.kind !== expectedKind) {
      throw new NotFoundError('Bulk assign job not found.');
    }
    if (!job.adminId || job.adminId.toString() !== adminId.toString()) {
      throw new ForbiddenError('You do not have access to this job.');
    }
    return { job: toPublic(job), pairs: job.pairs ?? [] };
  }

  async getJobForTenant(
    jobId: string,
    tenantId: mongoose.Types.ObjectId,
    createdByTenantUserId: mongoose.Types.ObjectId
  ): Promise<{ job: BulkAssignJobPublic; pairs: IBulkAssignPairRow[] }> {
    const job = await this.findOwnedJob(jobId);
    if (job.kind !== 'tenant_external_vm') {
      throw new NotFoundError('Bulk assign job not found.');
    }
    if (
      !job.tenantId ||
      job.tenantId.toString() !== tenantId.toString() ||
      !job.createdByTenantUserId ||
      job.createdByTenantUserId.toString() !== createdByTenantUserId.toString()
    ) {
      throw new ForbiddenError('You do not have access to this job.');
    }
    return { job: toPublic(job), pairs: job.pairs ?? [] };
  }

  private async findOwnedJob(jobId: string): Promise<IBulkAssignJob> {
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw new NotFoundError('Bulk assign job not found.');
    }
    const job = await BulkAssignJob.findById(jobId);
    if (!job) throw new NotFoundError('Bulk assign job not found.');
    return job;
  }
}

export const bulkAssignJobService = new BulkAssignJobService();
