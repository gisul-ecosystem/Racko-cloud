import mongoose from 'mongoose';
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { generatePassword } from '../../../utils/crypto';
import { config } from '../../../config';
import { VM } from '../vm.model';
import { VMJob } from '../vmJob.model';
import { VMEvent } from '../vmEvent.model';
import { selectNodesForBulk, selectNode } from './placementEngine';
import { pollTaskWithCleanup } from './taskPoller';
import { scheduleHyperVEnable } from './hypervQueue';
import { scheduleSoftwareInstall } from './softwareQueue';
import { softwareService } from '../../software/software.service';
import { buildGoldenTemplate, deleteGoldenTemplate } from './goldenImageProcessor';
import { bulkCloneDiagLog, fetchSourceVmDiagnostics, resolveCloneErrorMessage, shouldAttemptConnectivityReroute, summarizeDiskPlacement, type BulkClonePath, } from './cloneDiagnostics';
import { ProxmoxConnectionError } from '../../../utils/errors';
import type { IVMJob } from '../vmJob.model';
import type { BulkVMSpec } from '../vm.types';
import { notificationService } from '../../notification/notification.service';
import { isCancelling, finalizeCancelledJob } from './jobCancelCheck';

// QUEUE_SLOT: replace direct async call with message queue job (RabbitMQ/BullMQ)
// EVENT_SLOT: emit 'vm.bulk_created' event to message queue

/**
 * Mutex for VMID allocation — ensures only one VM fetches a VMID at a time.
 * This prevents duplicate IDs when multiple VMs in a batch run in parallel.
 */
let vmidMutex = Promise.resolve();

/**
 * Process bulk VM creation asynchronously.
 * Called after job is created and jobId returned to user.
 * NEVER crashes the app — all errors caught internally.
 */
export async function processBulkCreation(
  job: IVMJob,
  adminId: mongoose.Types.ObjectId
): Promise<void> {
  const jobId = job._id;
  const specs = job.requestedSpecs;
  const count = specs.count;
  const hasSoftware = (specs.softwareIds?.length ?? 0) > 0;

  // Bulk + software → golden image path (install once, clone many)
  if (count > 1 && hasSoftware) {
    logger.info('[Golden][Diag] bulk job — entering golden image path', {
      jobId: jobId.toString(),
      count,
      templateId: specs.templateId,
      templateNode: specs.templateNode,
      templateName: specs.templateName,
      softwareCount: specs.softwareIds?.length ?? 0,
      softwareIds: specs.softwareIds?.map((id) => id.toString()),
      enableVirtualization: specs.enableVirtualization ?? false,
      cloneType: specs.cloneType,
      cpuCores: specs.cpuCores,
      memoryGb: specs.memoryGb,
      diskGb: specs.diskGb,
      sysprepShutdownTimeoutMs: config.SYSPREP_SHUTDOWN_TIMEOUT_MS,
      execDeadlineMs: config.HYPERV_EXEC_DEADLINE_MS,
    });
    logger.info('[Golden] bulk job — using golden image path', {
      jobId: jobId.toString(),
      count,
      templateId: specs.templateId,
      templateNode: specs.templateNode,
      templateName: specs.templateName,
      softwareCount: specs.softwareIds?.length ?? 0,
      enableVirtualization: specs.enableVirtualization ?? false,
    });
    try {
      await VMJob.findByIdAndUpdate(jobId, { status: 'processing' });
      void notificationService.notifyJobStarted(jobId);
      const { goldenTemplateVmid, node } = await buildGoldenTemplate(job, adminId);

      logger.info('[Golden] bulk job — golden template ready, starting clones', {
        jobId: jobId.toString(),
        goldenTemplateVmid,
        node,
        vmCount: count,
      });

      const vmSpecs = buildVmSpecsForGoldenClone(job, adminId, node, goldenTemplateVmid);
      await runBatchClone(jobId, vmSpecs, { allowReroute: false });

      // Skip finalize if cancel handler already set a terminal status
      const afterGolden = await VMJob.findById(jobId).select('status').lean();
      if (afterGolden && !['cancelled', 'cancelling'].includes(afterGolden.status)) {
        await finalizeJobStatus(jobId);
      }
      void notificationService.notifyJobFinished(jobId);
      const finishedJob = await VMJob.findById(jobId).lean();
      logger.info('[Golden][Diag] bulk job — clone phase finished', {
        jobId: jobId.toString(),
        status: finishedJob?.status,
        completed: finishedJob?.completed,
        failed: finishedJob?.failed,
        jobErrors: finishedJob?.jobErrors,
      });
      logger.info('[Golden] bulk job — finished clone phase', { jobId: jobId.toString() });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[Golden] bulk creation failed', {
        jobId: jobId.toString(),
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined,
      });
      await VMJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        completedAt: new Date(),
        phase: undefined,
        $push: {
          jobErrors: {
            index: 0,
            vmName: `${specs.namePrefix}-*`,
            error: errorMsg,
            node: specs.templateNode,
          },
        },
      });
      void notificationService.notifyJobFinished(jobId);
    } finally {
      const updatedJob = await VMJob.findById(jobId).lean();
      if (updatedJob?.goldenTemplateVmid && updatedJob.goldenTemplateNode) {
        logger.info('[Golden] bulk job — cleaning up ephemeral template', {
          jobId: jobId.toString(),
          goldenTemplateVmid: updatedJob.goldenTemplateVmid,
          node: updatedJob.goldenTemplateNode,
        });
        await deleteGoldenTemplate(updatedJob.goldenTemplateNode, updatedJob.goldenTemplateVmid, jobId.toString());
      }
      await VMJob.findByIdAndUpdate(jobId, {
        $unset: { phase: 1, goldenTemplateVmid: 1, goldenTemplateNode: 1 },
      });
    }
    return;
  }

  bulkCloneDiagLog('bulk job — entering standard bulk path (no golden image)', {
    jobId: jobId.toString(),
    count,
    templateId: specs.templateId,
    templateNode: specs.templateNode,
    templateName: specs.templateName,
    cloneType: specs.cloneType,
    softwareCount: specs.softwareIds?.length ?? 0,
    cpuCores: specs.cpuCores,
    memoryGb: specs.memoryGb,
    diskGb: specs.diskGb,
  });

  try {
    await VMJob.findByIdAndUpdate(jobId, { status: 'processing' });
    void notificationService.notifyJobStarted(jobId);

    let nodeAllocations: Array<{ node: string; vmCount: number }>;
    try {
      nodeAllocations = await selectNodesForBulk(
        {
          cpuCores: specs.cpuCores,
          memoryGb: specs.memoryGb,
          diskGb: specs.diskGb,
          cloneType: specs.cloneType,
        },
        count
      );
    } catch (placementError) {
      logger.error('Bulk job placement failed', {
        jobId: jobId.toString(),
        error: placementError instanceof Error ? placementError.message : String(placementError),
      });
      await VMJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        completedAt: new Date(),
        $push: {
          jobErrors: {
            index: 0,
            vmName: `${specs.namePrefix}-*`,
            error: placementError instanceof Error ? placementError.message : 'Placement failed',
          },
        },
      });
      void notificationService.notifyJobFinished(jobId);
      return;
    }

    const vmSpecs: BulkVMSpec[] = [];
    let globalIndex = 1;

    for (const allocation of nodeAllocations) {
      for (let i = 0; i < allocation.vmCount; i++) {
        vmSpecs.push({
          vmName: `${specs.namePrefix}-${globalIndex}`,
          templateName: specs.templateName,
          index: globalIndex,
          node: allocation.node,
          templateId: specs.templateId,
          cloneType: specs.cloneType,
          cpuCores: specs.cpuCores,
          memoryGb: specs.memoryGb,
          diskGb: specs.diskGb,
          templateDiskGb: specs.templateDiskGb,
          templateCpuCores: specs.templateCpuCores,
          templateMemoryGb: specs.templateMemoryGb,
          adminId,
          jobId,
          description: undefined,
          consoleUsername: specs.consoleUsername,
          passwordMode: specs.passwordMode,
          consolePassword: specs.consolePassword,
          consoleProtocol: specs.consoleProtocol,
          enableVirtualization: specs.enableVirtualization ?? false,
          softwareIds: specs.softwareIds ?? [],
          schedulePostCreateJobs: job.type === 'single_create',
        });
        globalIndex++;
      }
    }

    await runBatchClone(jobId, vmSpecs, { allowReroute: true });
    // Skip finalize if cancel handler already set a terminal status
    const afterStandard = await VMJob.findById(jobId).select('status').lean();
    if (afterStandard && !['cancelled', 'cancelling'].includes(afterStandard.status)) {
      await finalizeJobStatus(jobId);
    }
    void notificationService.notifyJobFinished(jobId);
  } catch (error) {
    logger.error('Unexpected error in bulk processor', {
      jobId: jobId.toString(),
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      await VMJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        completedAt: new Date(),
      });
      void notificationService.notifyJobFinished(jobId);
    } catch (updateError) {
      logger.error('Failed to update job status after bulk processor error', {
        jobId: jobId.toString(),
        error: updateError instanceof Error ? updateError.message : String(updateError),
      });
    }
  }
}

function buildVmSpecsForGoldenClone(
  job: IVMJob,
  adminId: mongoose.Types.ObjectId,
  node: string,
  goldenTemplateVmid: number
): BulkVMSpec[] {
  const specs = job.requestedSpecs;
  const softwareIds = specs.softwareIds ?? [];
  const vmSpecs: BulkVMSpec[] = [];

  for (let i = 1; i <= specs.count; i++) {
    vmSpecs.push({
      vmName: `${specs.namePrefix}-${i}`,
      templateName: specs.templateName,
      index: i,
      node,
      templateId: specs.templateId,
      sourceTemplateId: goldenTemplateVmid,
      cloneType: specs.cloneType,
      cpuCores: specs.cpuCores,
      memoryGb: specs.memoryGb,
      diskGb: specs.diskGb,
      templateDiskGb: specs.diskGb,
      templateCpuCores: specs.cpuCores,
      templateMemoryGb: specs.memoryGb,
      adminId,
      jobId: job._id,
      description: undefined,
      consoleUsername: specs.consoleUsername,
      passwordMode: specs.passwordMode,
      consolePassword: specs.consolePassword,
      consoleProtocol: specs.consoleProtocol,
      enableVirtualization: specs.enableVirtualization ?? false,
      softwareIds,
      softwarePreInstalled: true,
      schedulePostCreateJobs: false,
    });
  }

  return vmSpecs;
}

async function runBatchClone(
  jobId: mongoose.Types.ObjectId,
  vmSpecs: BulkVMSpec[],
  options: { allowReroute: boolean }
): Promise<void> {
  const batchSize = config.VM_BULK_BATCH_SIZE;
  const batches: BulkVMSpec[][] = [];
  for (let i = 0; i < vmSpecs.length; i += batchSize) {
    batches.push(vmSpecs.slice(i, i + batchSize));
  }

  const clonePath: BulkClonePath = vmSpecs[0]?.softwarePreInstalled ? 'golden_delivery' : 'standard_bulk';

  bulkCloneDiagLog('starting clone batches', {
    jobId: jobId.toString(),
    clonePath,
    total: vmSpecs.length,
    batches: batches.length,
    batchSize,
    sourceTemplateId: vmSpecs[0]?.sourceTemplateId ?? vmSpecs[0]?.templateId,
    baseTemplateId: vmSpecs[0]?.templateId,
    cloneType: vmSpecs[0]?.cloneType,
    node: vmSpecs[0]?.node,
    allowReroute: options.allowReroute,
  });

  logger.info('Starting bulk VM clone batches', {
    jobId: jobId.toString(),
    total: vmSpecs.length,
    batches: batches.length,
    batchSize,
  });

  for (const batch of batches) {
    // Check for cancellation before starting each batch
    if (await isCancelling(jobId)) {
      logger.info('[BulkJob] Cancellation detected — stopping batch loop', {
        jobId: jobId.toString(),
        remainingBatches: batches.length - batches.indexOf(batch),
      });
      await finalizeCancelledJob(jobId);
      return;
    }

    const results = await Promise.allSettled(batch.map((spec) => createSingleVM(spec)));

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
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
      const tryReroute =
        options.allowReroute && shouldAttemptConnectivityReroute(error, errorMsg);

      if (tryReroute) {
        logger.warn('Proxmox unreachable in bulk job — attempting reroute to another node', {
          jobId: jobId.toString(),
          vmName: spec.vmName,
          failedNode: spec.node,
        });

        try {
          const rerouteNode = await selectNode(
            {
              cpuCores: spec.cpuCores,
              memoryGb: spec.memoryGb,
              diskGb: spec.diskGb,
              cloneType: spec.cloneType,
            },
            [spec.node]
          );

          spec.node = rerouteNode.node;
          const retryResult = await createSingleVM(spec);

          await VMJob.findByIdAndUpdate(jobId, {
            $inc: { completed: 1, pending: -1 },
            $push: { vmIds: retryResult },
          });
          continue;
        } catch (rerouteError) {
          logger.error('Reroute failed — recording as failed VM', {
            jobId: jobId.toString(),
            vmName: spec.vmName,
            error: resolveCloneErrorMessage(rerouteError),
          });
        }
      }

      bulkCloneDiagLog('VM clone failed in bulk job', {
        jobId: jobId.toString(),
        clonePath: spec.softwarePreInstalled ? 'golden_delivery' : 'standard_bulk',
        vmName: spec.vmName,
        index: spec.index,
        node: spec.node,
        sourceTemplateId: spec.sourceTemplateId ?? spec.templateId,
        baseTemplateId: spec.templateId,
        cloneType: spec.cloneType,
        fullClone: spec.cloneType === 'dedicated_storage',
        softwarePreInstalled: spec.softwarePreInstalled ?? false,
        proxmoxError: errorMsg,
        proxmoxHttpStatus: error instanceof ProxmoxConnectionError ? error.httpStatus : undefined,
      });

      logger.warn('VM creation failed in bulk job', {
        jobId: jobId.toString(),
        vmName: spec.vmName,
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

async function finalizeJobStatus(jobId: mongoose.Types.ObjectId): Promise<void> {
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

  logger.info('Bulk VM creation job finished', {
    jobId: jobId.toString(),
    status: finalStatus,
    completed: finalJob.completed,
    failed: finalJob.failed,
  });
}

/**
 * Create a single VM as part of a bulk job.
 * Returns the MongoDB ObjectId of the created VM.
 */
async function createSingleVM(spec: BulkVMSpec): Promise<mongoose.Types.ObjectId> {
  const sourceTemplateId = spec.sourceTemplateId ?? spec.templateId;
  const clonePath: BulkClonePath = spec.softwarePreInstalled
    ? 'golden_delivery'
    : 'standard_bulk';

  let sourceDiagnostics;
  try {
    sourceDiagnostics = await fetchSourceVmDiagnostics(spec.node, sourceTemplateId);
    bulkCloneDiagLog('source template config before clone', {
      jobId: spec.jobId.toString(),
      clonePath,
      vmName: spec.vmName,
      index: spec.index,
      node: spec.node,
      sourceTemplateId,
      baseTemplateId: spec.templateId,
      usingGoldenTemplate: sourceTemplateId !== spec.templateId,
      cloneType: spec.cloneType,
      fullClone: spec.cloneType === 'dedicated_storage',
      sourceName: sourceDiagnostics.name,
      sourceIsTemplate: sourceDiagnostics.template === 1,
      sourcePowerState: sourceDiagnostics.powerState,
      sourceBios: sourceDiagnostics.bios,
      sourceMachine: sourceDiagnostics.machine,
      sourceDisks: sourceDiagnostics.disks,
      sourceDiskStorage: summarizeDiskPlacement(sourceDiagnostics),
    });
  } catch (diagErr) {
    bulkCloneDiagLog('failed to fetch source template config before clone', {
      jobId: spec.jobId.toString(),
      clonePath,
      vmName: spec.vmName,
      node: spec.node,
      sourceTemplateId,
      error: diagErr instanceof Error ? diagErr.message : String(diagErr),
    });
  }

  // Resolve per-VM console credentials.
  // Username: from template ciuser via job specs (same for all VMs in the batch).
  // Password: fixed → shared value from the request; dynamic → unique per VM.
  const consoleUsername = spec.consoleUsername;
  const consolePassword =
    spec.passwordMode === 'dynamic' ? generatePassword() : (spec.consolePassword ?? '');

  // Select storage pool for dedicated clones only.
  // Linked clones must use template storage — Proxmox enforces this, never send storage for them.
  // For dedicated clones: prefer shared storage (Ceph/NFS) for live-migration support,
  // fall back to local storage sorted by most free space.
  let storagePool: string | undefined;

  if (spec.cloneType === 'dedicated_storage' && !spec.softwarePreInstalled) {
    const nodeResourcesResponse = await proxmoxClient.get<{
      data: Array<{ storage: string; avail: number; active: number; enabled: number; content: string; shared?: number; type?: string }>;
    }>(`/nodes/${spec.node}/storage`);

    const eligible = nodeResourcesResponse.data.data
      .filter((s) => s.active === 1 && s.enabled === 1 && s.content?.includes('images'));

    const shared = eligible.filter((s) => s.shared === 1).sort((a, b) => b.avail - a.avail);
    const local = eligible.filter((s) => s.shared !== 1).sort((a, b) => b.avail - a.avail);

    storagePool = (shared[0] ?? local[0])?.storage;
  }

  let vmid!: number;
  let cloneUpid!: string;

  await new Promise<void>((resolve, reject) => {
    vmidMutex = vmidMutex.then(async () => {
      try {
        const response = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
        vmid = response.data.data;

        const cloneBody: Record<string, unknown> = {
          newid: vmid,
          name: spec.vmName,
          full: spec.cloneType === 'dedicated_storage' ? 1 : 0,
          target: spec.node,
        };
        if (storagePool) cloneBody['storage'] = storagePool;

        const cloneEndpoint = `/nodes/${spec.node}/qemu/${sourceTemplateId}/clone`;
        bulkCloneDiagLog('sending clone request', {
          jobId: spec.jobId.toString(),
          clonePath,
          vmName: spec.vmName,
          index: spec.index,
          node: spec.node,
          sourceTemplateId,
          baseTemplateId: spec.templateId,
          newVmid: vmid,
          cloneEndpoint,
          cloneBody,
          storagePoolSelected: storagePool ?? null,
          softwarePreInstalled: spec.softwarePreInstalled ?? false,
        });

        const cloneResponse = await proxmoxClient.post<{ data: string }>(
          cloneEndpoint,
          cloneBody
        );
        cloneUpid = cloneResponse.data.data;
        bulkCloneDiagLog('clone task started', {
          jobId: spec.jobId.toString(),
          clonePath,
          vmName: spec.vmName,
          newVmid: vmid,
          node: spec.node,
          upid: cloneUpid,
        });
        resolve();
      } catch (err) {
        bulkCloneDiagLog('clone request failed', {
          jobId: spec.jobId.toString(),
          clonePath,
          vmName: spec.vmName,
          index: spec.index,
          node: spec.node,
          sourceTemplateId,
          baseTemplateId: spec.templateId,
          proxmoxError: resolveCloneErrorMessage(err),
        });
        reject(err);
      }
    });
  });

  const cloneResult = await pollTaskWithCleanup(cloneUpid, spec.node, vmid, true);

  bulkCloneDiagLog('clone task finished', {
    jobId: spec.jobId.toString(),
    clonePath,
    vmName: spec.vmName,
    newVmid: vmid,
    node: spec.node,
    upid: cloneUpid,
    outcome: cloneResult,
    sourceTemplateId,
    baseTemplateId: spec.templateId,
  });

  if (cloneResult === 'unknown') {
    logger.warn('[BulkVM] Clone task outcome unknown — saving VM as creating for reconciliation', {
      vmName: spec.vmName,
      vmid,
      node: spec.node,
      upid: cloneUpid,
    });

    const vm = await VM.create({
      vmid,
      node: spec.node,
      adminId: spec.adminId,
      name: spec.vmName,
      description: spec.description,
      templateId: spec.templateId,
      templateName: spec.templateName,
      cloneType: spec.cloneType,
      allocatedCpu: spec.cpuCores,
      allocatedMemoryGb: spec.memoryGb,
      allocatedDiskGb: spec.diskGb,
      status: 'creating',
      proxmoxStatus: 'unknown',
      consoleUsername,
      consolePassword,
      consoleProtocol: spec.consoleProtocol,
      jobId: spec.jobId,
      haEnabled: false,
      lastError: 'Clone task outcome unknown — connectivity lost during polling. Pending reconciliation.',
      softwareInstalls: (spec.softwareIds ?? []).map((id) => ({
        softwareId: id,
        name: id.toString(),
        status: spec.softwarePreInstalled ? ('installed' as const) : ('pending' as const),
        sweeperAttempts: 0,
        cancelled: false,
      })),
    });

    await VMEvent.create({
      vmId: vm._id,
      vmid,
      adminId: spec.adminId,
      event: 'VM_CREATED',
      status: 'unknown',
      details: { node: spec.node, cloneType: spec.cloneType, jobId: spec.jobId.toString(), upid: cloneUpid },
      ipAddress: 'bulk-job',
      userAgent: 'bulk-processor',
    });

    return vm._id;
  }

  // Inject the cloud-init password + apply any spec overrides. cloudbase-init sets
  // the password for the template's built-in account (no ciuser rename).
  const configUpdates: Record<string, unknown> = {
    cipassword: consolePassword,
  };
  if (spec.cpuCores !== spec.templateCpuCores) configUpdates['cores'] = spec.cpuCores;
  if (spec.memoryGb !== spec.templateMemoryGb) configUpdates['memory'] = Math.round(spec.memoryGb * 1024);

  await proxmoxClient.post(`/nodes/${spec.node}/qemu/${vmid}/config`, configUpdates);

  // Regenerate the cloud-init drive so the new credentials take effect.
  // Best-effort: templates without a cloud-init drive return 404 — log and continue.
  try {
    await proxmoxClient.put(`/nodes/${spec.node}/qemu/${vmid}/cloudinit`, {});
  } catch (err) {
    logger.warn('[BulkVM] cloud-init regenerate failed — continuing', {
      vmName: spec.vmName,
      vmid,
      node: spec.node,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (spec.cloneType === 'dedicated_storage' && spec.diskGb > spec.templateDiskGb) {
    const extraGb = spec.diskGb - spec.templateDiskGb;
    const resizeResponse = await proxmoxClient.put<{ data: string }>(
      `/nodes/${spec.node}/qemu/${vmid}/resize`,
      { disk: 'scsi0', size: `+${extraGb}G` }
    );
    const resizeResult = await pollTaskWithCleanup(resizeResponse.data.data, spec.node, vmid, false);
    if (resizeResult === 'unknown') {
      logger.warn('[BulkVM] Disk resize task outcome unknown', {
        vmName: spec.vmName,
        vmid,
        node: spec.node,
      });
    }
  }

  const hyperVBakedIn = spec.softwarePreInstalled && spec.enableVirtualization;

  const vm = await VM.create({
    vmid,
    node: spec.node,
    adminId: spec.adminId,
    name: spec.vmName,
    description: spec.description,
    templateId: spec.templateId,
    templateName: spec.templateName,
    cloneType: spec.cloneType,
    allocatedCpu: spec.cpuCores,
    allocatedMemoryGb: spec.memoryGb,
    allocatedDiskGb: spec.diskGb,
    status: 'stopped',
    proxmoxStatus: 'stopped',
    consoleUsername,
    consolePassword,
    consoleProtocol: spec.consoleProtocol,
    jobId: spec.jobId,
    haEnabled: false,
    enableVirtualization: spec.enableVirtualization ?? false,
    hyperVStatus: hyperVBakedIn ? 'enabled' : spec.enableVirtualization ? 'pending' : 'disabled',
    hyperVStatusChangedAt: new Date(),
    hyperVAttemptCount: 0,
    softwareInstalls: await buildSoftwareInstallsWithNames(spec),
  });

  await VMEvent.create({
    vmId: vm._id,
    vmid,
    adminId: spec.adminId,
    event: 'VM_CREATED',
    status: 'success',
    details: {
      node: spec.node,
      cloneType: spec.cloneType,
      jobId: spec.jobId.toString(),
      goldenImage: spec.softwarePreInstalled ?? false,
    },
    ipAddress: 'bulk-job',
    userAgent: 'bulk-processor',
  });

  if (spec.schedulePostCreateJobs) {
    if (spec.enableVirtualization) {
      scheduleHyperVEnable({
        vmObjectId: vm._id,
        node: spec.node,
        vmid,
        adminId: spec.adminId,
        vmName: vm.name,
      });
    }

    if ((spec.softwareIds ?? []).length > 0) {
      const softwareParams = {
        vmObjectId: vm._id,
        node: spec.node,
        vmid,
        adminId: spec.adminId,
        vmName: vm.name,
      };
      if (spec.enableVirtualization) {
        setTimeout(() => scheduleSoftwareInstall(softwareParams), 15 * 60 * 1000);
      } else {
        scheduleSoftwareInstall(softwareParams);
      }
    }
  }

  return vm._id;
}

async function buildSoftwareInstallsWithNames(spec: BulkVMSpec) {
  const softwareIds = spec.softwareIds ?? [];
  if (softwareIds.length === 0) return [];

  const softwareDocs = await softwareService.getByIds(softwareIds);
  const softwareNameMap = new Map(softwareDocs.map((s) => [s._id.toString(), s.name]));

  return defaultSoftwareInstalls(spec, softwareNameMap);
}

function defaultSoftwareInstalls(
  spec: BulkVMSpec,
  softwareNameMap: Map<string, string>
) {
  const now = new Date();
  return (spec.softwareIds ?? []).map((id) => ({
    softwareId: id,
    name: softwareNameMap.get(id.toString()) ?? id.toString(),
    status: spec.softwarePreInstalled ? ('installed' as const) : ('pending' as const),
    installedAt: spec.softwarePreInstalled ? now : undefined,
    sweeperAttempts: 0,
    cancelled: false,
  }));
}
