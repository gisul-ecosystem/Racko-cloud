/**
 * cloneJobBatch.ts
 *
 * Shared batch-clone helpers used by processVmClone.
 * Mirrors the runBatchClone + finalizeJobStatus pattern from bulkProcessor
 * but writes isVmClone / sourceVmId / sourceVmName onto each created VM.
 */

import mongoose from 'mongoose';
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { VM } from '../vm.model';
import { VMJob } from '../vmJob.model';
import { VMEvent } from '../vmEvent.model';
import { pollTaskWithCleanup } from './taskPoller';
import { resolveCloneErrorMessage, shouldAttemptConnectivityReroute } from './cloneDiagnostics';
import type { BulkVMSpec } from '../vm.types';
import type { IVMJob } from '../vmJob.model';

// Mutex — prevents duplicate Proxmox VMIDs under concurrent clone requests
let vmidMutex = Promise.resolve();

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runBatchCloneForCloneJob(
  jobId: mongoose.Types.ObjectId,
  vmSpecs: BulkVMSpec[]
): Promise<void> {
  const batchSize = config.VM_CLONE_BATCH_SIZE;
  const batches: BulkVMSpec[][] = [];
  for (let i = 0; i < vmSpecs.length; i += batchSize) {
    batches.push(vmSpecs.slice(i, i + batchSize));
  }

  logger.info('[CloneJob] Starting clone batches', {
    jobId: jobId.toString(),
    total: vmSpecs.length,
    batches: batches.length,
    batchSize,
  });

  for (const batch of batches) {
    const results = await Promise.allSettled(batch.map((spec) => createClonedVM(spec)));

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const spec = batch[i]!;

      if (result.status === 'fulfilled') {
        await VMJob.findByIdAndUpdate(jobId, {
          $inc: { completed: 1, pending: -1 },
          $push: { vmIds: result.value },
        });
        continue;
      }

      const error = result.reason;
      const errorMsg = resolveCloneErrorMessage(error);
      const tryReroute = shouldAttemptConnectivityReroute(error, errorMsg);

      if (tryReroute) {
        logger.warn('[CloneJob] Proxmox unreachable — rerouting not supported for VM clones (source must stay on same node)', {
          jobId: jobId.toString(),
          vmName: spec.vmName,
          node: spec.node,
        });
        // Rerouting is not safe for VM clones — the source VM lives on a specific node.
        // Fall through to record as failed.
      }

      logger.warn('[CloneJob] VM clone failed in batch', {
        jobId: jobId.toString(),
        vmName: spec.vmName,
        index: spec.index,
        node: spec.node,
        error: errorMsg,
      });

      await VMJob.findByIdAndUpdate(jobId, {
        $inc: { failed: 1, pending: -1 },
        $push: {
          jobErrors: {
            index: spec.index,
            vmName: spec.vmName,
            error: errorMsg,
            node: spec.node,
          },
        },
      });
    }
  }
}

export async function finalizeCloneJobStatus(jobId: mongoose.Types.ObjectId): Promise<void> {
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

  logger.info('[CloneJob] Clone job finished', {
    jobId: jobId.toString(),
    status: finalStatus,
    completed: finalJob.completed,
    failed: finalJob.failed,
  });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function createClonedVM(spec: BulkVMSpec): Promise<mongoose.Types.ObjectId> {
  let vmid!: number;
  let cloneUpid!: string;

  // Storage pool selection — prefer shared storage (Ceph/NFS) for live-migration support
  const nodeStorageResp = await proxmoxClient.get<{
    data: Array<{ storage: string; avail: number; active: number; enabled: number; content: string; shared?: number }>;
  }>(`/nodes/${spec.node}/storage`);

  const eligible = nodeStorageResp.data.data.filter(
    (s) => s.active === 1 && s.enabled === 1 && s.content?.includes('images')
  );
  const shared = eligible.filter((s) => s.shared === 1).sort((a, b) => b.avail - a.avail);
  const local = eligible.filter((s) => s.shared !== 1).sort((a, b) => b.avail - a.avail);
  const storagePool = (shared[0] ?? local[0])?.storage;

  // VMID mutex — one at a time to avoid duplicate IDs
  await new Promise<void>((resolve, reject) => {
    vmidMutex = vmidMutex.then(async () => {
      try {
        const nextIdResp = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
        vmid = nextIdResp.data.data;

        logger.info('[CloneJob] Starting Proxmox clone', {
          jobId: spec.jobId.toString(),
          sourceVmid: spec.templateId,
          newVmid: vmid,
          node: spec.node,
          name: spec.vmName,
        });

        const cloneBody: Record<string, unknown> = {
          newid: vmid,
          name: spec.vmName,
          full: 1,                  // always full/dedicated clone
          target: spec.node,
        };
        if (storagePool) cloneBody['storage'] = storagePool;

        const cloneResp = await proxmoxClient.post<{ data: string }>(
          `/nodes/${spec.node}/qemu/${spec.templateId}/clone`,
          cloneBody
        );
        cloneUpid = cloneResp.data.data;
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  const cloneResult = await pollTaskWithCleanup(cloneUpid, spec.node, vmid, true);

  if (cloneResult === 'unknown') {
    logger.warn('[CloneJob] Clone task outcome unknown — saving VM as creating for reconciliation', {
      vmName: spec.vmName,
      vmid,
      node: spec.node,
    });

    const vm = await VM.create({
      vmid,
      node: spec.node,
      adminId: spec.adminId,
      name: spec.vmName,
      templateId: spec.templateId,
      templateName: spec.templateName,
      cloneType: 'dedicated_storage',
      allocatedCpu: spec.cpuCores,
      allocatedMemoryGb: spec.memoryGb,
      allocatedDiskGb: spec.diskGb,
      status: 'creating',
      proxmoxStatus: 'unknown',
      consoleUsername: spec.consoleUsername,
      consolePassword: spec.consolePassword,
      consoleProtocol: spec.consoleProtocol,
      jobId: spec.jobId,
      haEnabled: false,
      isVmClone: spec.isVmClone ?? false,
      sourceVmId: spec.sourceVmId,
      sourceVmName: spec.sourceVmName,
      lastError: 'Clone task outcome unknown — connectivity lost during polling. Pending reconciliation.',
      softwareInstalls: [],
    });

    await VMEvent.create({
      vmId: vm._id,
      vmid,
      adminId: spec.adminId,
      event: 'VM_CLONED',
      status: 'unknown',
      details: {
        sourceVmId: spec.sourceVmId?.toString(),
        sourceVmName: spec.sourceVmName,
        node: spec.node,
        jobId: spec.jobId.toString(),
        upid: cloneUpid,
      },
      ipAddress: 'clone-job',
      userAgent: 'clone-processor',
    });

    return vm._id;
  }

  if (cloneResult === 'failed') {
    throw new Error(`Proxmox clone task failed for VM ${spec.vmName}.`);
  }

  // Apply cloud-init password so console credentials are correct
  const configUpdates: Record<string, unknown> = { cipassword: spec.consolePassword };
  await proxmoxClient.post(`/nodes/${spec.node}/qemu/${vmid}/config`, configUpdates);

  try {
    await proxmoxClient.put(`/nodes/${spec.node}/qemu/${vmid}/cloudinit`, {});
  } catch (err) {
    logger.warn('[CloneJob] cloud-init regenerate failed — continuing', {
      vmName: spec.vmName,
      vmid,
      node: spec.node,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const vm = await VM.create({
    vmid,
    node: spec.node,
    adminId: spec.adminId,
    name: spec.vmName,
    templateId: spec.templateId,
    templateName: spec.templateName,
    cloneType: 'dedicated_storage',
    allocatedCpu: spec.cpuCores,
    allocatedMemoryGb: spec.memoryGb,
    allocatedDiskGb: spec.diskGb,
    status: 'stopped',
    proxmoxStatus: 'stopped',
    consoleUsername: spec.consoleUsername,
    consolePassword: spec.consolePassword,
    consoleProtocol: spec.consoleProtocol,
    jobId: spec.jobId,
    haEnabled: false,
    enableVirtualization: false,
    hyperVStatus: 'disabled',
    hyperVAttemptCount: 0,
    hyperVCancelled: false,
    softwareInstalls: [],
    isVmClone: spec.isVmClone ?? false,
    sourceVmId: spec.sourceVmId,
    sourceVmName: spec.sourceVmName,
    consoleReady: false,
  });

  await VMEvent.create({
    vmId: vm._id,
    vmid,
    adminId: spec.adminId,
    event: 'VM_CLONED',
    status: 'success',
    details: {
      sourceVmId: spec.sourceVmId?.toString(),
      sourceVmName: spec.sourceVmName,
      node: spec.node,
      jobId: spec.jobId.toString(),
    },
    ipAddress: 'clone-job',
    userAgent: 'clone-processor',
  });

  logger.info('[CloneJob] VM cloned successfully', {
    jobId: spec.jobId.toString(),
    newVmId: vm._id.toString(),
    newVmid: vmid,
    vmName: spec.vmName,
    node: spec.node,
  });

  return vm._id;
}
