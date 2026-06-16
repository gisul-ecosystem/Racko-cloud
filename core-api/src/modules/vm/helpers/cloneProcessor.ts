import mongoose from 'mongoose';
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { VM } from '../vm.model';
import { VMJob } from '../vmJob.model';
import { VMEvent } from '../vmEvent.model';
import { pollTask } from './taskPoller';
import { notificationService } from '../../notification/notification.service';
import type { IVMJob } from '../vmJob.model';

// Shared mutex for VMID allocation — prevents duplicate IDs under concurrent clones
let vmidMutex = Promise.resolve();

/**
 * Process a VM clone job asynchronously.
 * Never throws — all errors are caught and written to the job record.
 */
export async function processVmClone(
  job: IVMJob,
  adminId: mongoose.Types.ObjectId
): Promise<void> {
  const jobId = job._id;
  const specs = job.requestedSpecs;
  const sourceVmId = specs.sourceVmId!;
  const cloneName = specs.namePrefix;

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

    // ── 3. Get next VMID + start clone (mutex prevents duplicate IDs) ───────
    let newVmid!: number;
    let cloneUpid!: string;

    await new Promise<void>((resolve, reject) => {
      vmidMutex = vmidMutex.then(async () => {
        try {
          const nextIdResp = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
          newVmid = nextIdResp.data.data;

          logger.info('[CloneJob] Starting Proxmox clone', {
            jobId: jobId.toString(),
            sourceVmid: sourceVm.vmid,
            newVmid,
            node: sourceVm.node,
            name: cloneName,
          });

          const cloneResp = await proxmoxClient.post<{ data: string }>(
            `/nodes/${sourceVm.node}/qemu/${sourceVm.vmid}/clone`,
            { newid: newVmid, name: cloneName, full: 1, target: sourceVm.node }
          );
          cloneUpid = cloneResp.data.data;
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });

    // ── 4. Poll clone task ──────────────────────────────────────────────────
    const cloneResult = await pollTask(cloneUpid, sourceVm.node);

    if (cloneResult.result === 'failed') {
      throw new Error(`Proxmox clone task failed (exitstatus: ${cloneResult.exitstatus ?? 'unknown'}).`);
    }

    // ── 5. Restart source VM ────────────────────────────────────────────────
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

    // ── 6. Save cloned VM to DB ─────────────────────────────────────────────
    const clonedVm = await VM.create({
      vmid: newVmid,
      node: sourceVm.node,
      adminId,
      isVmClone: true,
      sourceVmId: sourceVm._id,
      sourceVmName: sourceVm.name,
      name: cloneName,
      templateId: sourceVm.templateId,
      templateName: sourceVm.templateName,
      cloneType: 'dedicated_storage',
      allocatedCpu: sourceVm.allocatedCpu,
      allocatedMemoryGb: sourceVm.allocatedMemoryGb,
      allocatedDiskGb: sourceVm.allocatedDiskGb,
      status: 'stopped',
      proxmoxStatus: 'stopped',
      consoleUsername: sourceVm.consoleUsername,
      consolePassword: sourceVm.consolePassword,
      consoleProtocol: sourceVm.consoleProtocol,
      consoleReady: false,
      haEnabled: false,
      enableVirtualization: false,
      hyperVStatus: 'disabled',
      hyperVAttemptCount: 0,
      hyperVCancelled: false,
      softwareInstalls: [],
      jobId,
    });

    await VMEvent.create({
      vmId: clonedVm._id,
      vmid: newVmid,
      adminId,
      event: 'VM_CLONED',
      status: 'success',
      details: {
        sourceVmId: sourceVm._id.toString(),
        sourceVmid: sourceVm.vmid,
        sourceVmName: sourceVm.name,
        node: sourceVm.node,
        sourceWasRunning: wasRunning,
      },
      ipAddress: 'clone-job',
      userAgent: 'clone-processor',
    });

    // ── 7. Mark job completed ───────────────────────────────────────────────
    await VMJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      completed: 1,
      failed: 0,
      pending: 0,
      vmIds: [clonedVm._id],
      completedAt: new Date(),
    });

    void notificationService.notifyJobFinished(jobId);

    logger.info('[CloneJob] Clone job completed', {
      jobId: jobId.toString(),
      newVmId: clonedVm._id.toString(),
      newVmid,
      node: sourceVm.node,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[CloneJob] Clone job failed', {
      jobId: jobId.toString(),
      error: message,
    });

    await VMJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      failed: 1,
      pending: 0,
      completedAt: new Date(),
      $push: {
        jobErrors: {
          index: 0,
          vmName: cloneName,
          error: message,
        },
      },
    });

    void notificationService.notifyJobFinished(jobId);
  }
}
