import mongoose from 'mongoose';
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { VM } from '../vm.model';
import { VMJob } from '../vmJob.model';
import { pollTask } from './taskPoller';
import { notificationService } from '../../notification/notification.service';
import type { IVMJob } from '../vmJob.model';
import type { BulkVMSpec } from '../vm.types';

// Re-use the battle-tested batch clone + finalizer from the bulk processor
import { runBatchCloneForCloneJob, finalizeCloneJobStatus } from './cloneJobBatch';

/**
 * Process a VM clone job asynchronously.
 * Supports count=1 (single clone, original behaviour) and count>1 (bulk clone).
 * Never throws — all errors are caught and written to the job record.
 */
export async function processVmClone(
  job: IVMJob,
  adminId: mongoose.Types.ObjectId
): Promise<void> {
  const jobId = job._id;
  const specs = job.requestedSpecs;
  const sourceVmId = specs.sourceVmId!;
  const namePrefix = specs.namePrefix;
  const count = specs.count ?? 1;

  try {
    await VMJob.findByIdAndUpdate(jobId, { status: 'processing' });
    void notificationService.notifyJobStarted(jobId);

    // ── 1. Fetch source VM ──────────────────────────────────────────────────
    const sourceVm = await VM.findById(sourceVmId);
    if (!sourceVm) {
      throw new Error(`Source VM ${sourceVmId.toString()} not found.`);
    }

    // ── 2. Stop source VM if running ────────────────────────────────────────
    const wasRunning = sourceVm.status === 'running';
    if (wasRunning) {
      logger.info('[CloneJob] Stopping source VM before clone', {
        jobId: jobId.toString(),
        sourceVmid: sourceVm.vmid,
        node: sourceVm.node,
        count,
      });

      const stopResp = await proxmoxClient.post<{ data: string }>(
        `/nodes/${sourceVm.node}/qemu/${sourceVm.vmid}/status/shutdown`,
        {}
      );
      const stopPoll = await pollTask(stopResp.data.data, sourceVm.node);

      if (stopPoll.result === 'failed') {
        throw new Error('Failed to stop source VM before cloning.');
      }

      sourceVm.status = 'stopped';
      sourceVm.proxmoxStatus = 'stopped';
      sourceVm.isHibernated = false;
      await sourceVm.save();
    }

    // ── 3. Build per-VM specs and run batch clone ────────────────────────────
    // Names: count=1 → exact namePrefix; count>1 → namePrefix-1, namePrefix-2, …
    const vmSpecs: BulkVMSpec[] = [];
    for (let i = 1; i <= count; i++) {
      vmSpecs.push({
        vmName: count === 1 ? namePrefix : `${namePrefix}-${i}`,
        templateName: sourceVm.templateName,
        index: i,
        node: sourceVm.node,
        templateId: sourceVm.vmid,          // clone from the live VM's Proxmox VMID
        cloneType: 'dedicated_storage',
        cpuCores: sourceVm.allocatedCpu,
        memoryGb: sourceVm.allocatedMemoryGb,
        diskGb: sourceVm.allocatedDiskGb,
        templateDiskGb: sourceVm.allocatedDiskGb,
        templateCpuCores: sourceVm.allocatedCpu,
        templateMemoryGb: sourceVm.allocatedMemoryGb,
        adminId,
        jobId,
        description: undefined,
        consoleUsername: sourceVm.consoleUsername ?? '',
        passwordMode: 'fixed',
        consolePassword: sourceVm.consolePassword,
        consoleProtocol: sourceVm.consoleProtocol,
        enableVirtualization: false,
        softwareIds: [],
        schedulePostCreateJobs: false,
        // Clone-specific extras so the created VM is marked as a clone
        isVmClone: true,
        sourceVmId: sourceVm._id,
        sourceVmName: sourceVm.name,
      });
    }

    await runBatchCloneForCloneJob(jobId, vmSpecs);

    // ── 4. Restart source VM ────────────────────────────────────────────────
    if (wasRunning) {
      try {
        const startResp = await proxmoxClient.post<{ data: string }>(
          `/nodes/${sourceVm.node}/qemu/${sourceVm.vmid}/status/start`,
          {}
        );
        const startPoll = await pollTask(startResp.data.data, sourceVm.node);
        if (startPoll.result === 'success') {
          sourceVm.status = 'running';
          sourceVm.proxmoxStatus = 'running';
          await sourceVm.save();
          logger.info('[CloneJob] Source VM restarted', { jobId: jobId.toString() });
        } else {
          logger.warn('[CloneJob] Source VM failed to restart after clone', { jobId: jobId.toString() });
        }
      } catch (restartErr) {
        // Non-fatal — clone succeeded, source restart failure is logged but doesn't fail the job
        logger.error('[CloneJob] Error restarting source VM after clone', {
          jobId: jobId.toString(),
          error: restartErr instanceof Error ? restartErr.message : String(restartErr),
        });
      }
    }

    // ── 5. Finalize job status (completed / partial / failed) ───────────────
    // Skip if already finalized by cancel handler inside runBatchCloneForCloneJob
    const currentJob = await VMJob.findById(jobId).select('status').lean();
    if (currentJob && !['cancelled', 'cancelling'].includes(currentJob.status)) {
      await finalizeCloneJobStatus(jobId);
    }
    void notificationService.notifyJobFinished(jobId);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[CloneJob] Clone job failed', {
      jobId: jobId.toString(),
      error: message,
    });

    await VMJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      failed: specs.count ?? 1,
      pending: 0,
      completedAt: new Date(),
      $push: {
        jobErrors: {
          index: 0,
          vmName: namePrefix,
          error: message,
        },
      },
    });

    void notificationService.notifyJobFinished(jobId);
  }
}
