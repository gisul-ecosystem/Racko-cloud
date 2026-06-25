import mongoose from 'mongoose';
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { VMJob } from '../vmJob.model';
import { VM } from '../vm.model';
import { provisionHyperVForVM } from './hypervProvisioner';
import {
  installSoftwareOnGuest,
  runSysprepAndShutdown,
} from './softwareProvisioner';
import { pollTaskWithCleanup } from './taskPoller';
import { retryProxmoxDelete } from './deleteRetry';
import {
  bulkCloneDiagLog,
  fetchSourceVmDiagnostics,
  resolveCloneErrorMessage,
  resolveCloneStorage,
  summarizeDiskPlacement,
} from './cloneDiagnostics';
import { withCloneWorkerRetry } from './cloneWorkerRetry';
import type { IVMJob } from '../vmJob.model';

let seedVmidMutex = Promise.resolve();

function goldenLog(step: string, message: string, meta: Record<string, unknown> = {}): void {
  logger.info(`[Golden] ${step} — ${message}`, meta);
}

/**
 * Allocate a VMID and clone from a template on Proxmox (golden seed only).
 */
async function cloneSeedVm(params: {
  node: string;
  sourceTemplateId: number;
  vmName: string;
  jobId: string;
  cloneType: 'dedicated_storage' | 'dynamic_storage';
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  templateDiskGb: number;
  templateCpuCores: number;
  templateMemoryGb: number;
}): Promise<number> {
  // Golden seed is always a full clone — resolve storage from template's own disk.
  // Prefers shared storage (Ceph/NFS), falls back to template's storage pool.
  let storagePool: string | undefined;
  let templateScsi0: string | undefined;
  try {
    const diag = await fetchSourceVmDiagnostics(params.node, params.sourceTemplateId);
    templateScsi0 = diag.scsi0;
  } catch {
    // non-fatal — resolveCloneStorage handles undefined gracefully
  }
  storagePool = await resolveCloneStorage(params.node, templateScsi0, 'dedicated_storage');
  goldenLog('1/8 clone-seed', 'storage pool resolved', {
    jobId: params.jobId,
    node: params.node,
    storagePool: storagePool ?? 'none (proxmox default)',
    templateScsi0: templateScsi0 ?? 'unknown',
    cloneType: params.cloneType,
  });

  let vmid!: number;
  let cloneUpid!: string;

  try {
    const baseTemplateDiag = await fetchSourceVmDiagnostics(params.node, params.sourceTemplateId);
    bulkCloneDiagLog('golden seed — base template config before seed clone', {
      jobId: params.jobId,
      clonePath: 'golden_seed',
      node: params.node,
      sourceTemplateId: params.sourceTemplateId,
      vmName: params.vmName,
      cloneType: params.cloneType,
      fullClone: params.cloneType === 'dedicated_storage',
      sourceName: baseTemplateDiag.name,
      sourceIsTemplate: baseTemplateDiag.template === 1,
      sourcePowerState: baseTemplateDiag.powerState,
      sourceDisks: baseTemplateDiag.disks,
      sourceDiskStorage: summarizeDiskPlacement(baseTemplateDiag),
      sourceBios: baseTemplateDiag.bios,
      sourceMachine: baseTemplateDiag.machine,
    });
  } catch (diagErr) {
    bulkCloneDiagLog('golden seed — failed to fetch base template config', {
      jobId: params.jobId,
      node: params.node,
      sourceTemplateId: params.sourceTemplateId,
      error: diagErr instanceof Error ? diagErr.message : String(diagErr),
    });
  }

  // Wraps VMID allocation + clone POST + task poll with worker-retry logic.
  // Each retry allocates a fresh VMID via the mutex to avoid conflicts.
  await withCloneWorkerRetry(async () => {
    await new Promise<void>((resolve, reject) => {
      seedVmidMutex = seedVmidMutex.then(async () => {
        try {
          const response = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
          vmid = response.data.data;

          const cloneBody: Record<string, unknown> = {
            newid: vmid,
            name: params.vmName,
            full: 1,
            target: params.node,
          };
          if (storagePool) cloneBody['storage'] = storagePool;

          const cloneEndpoint = `/nodes/${params.node}/qemu/${params.sourceTemplateId}/clone`;
          bulkCloneDiagLog('golden seed — sending clone request', {
            jobId: params.jobId,
            clonePath: 'golden_seed',
            node: params.node,
            sourceTemplateId: params.sourceTemplateId,
            newVmid: vmid,
            vmName: params.vmName,
            cloneEndpoint,
            cloneBody,
            storagePoolSelected: storagePool ?? null,
          });

          goldenLog('1/8 clone-seed', 'sending clone request', {
            jobId: params.jobId,
            node: params.node,
            sourceTemplateId: params.sourceTemplateId,
            newVmid: vmid,
            vmName: params.vmName,
            cloneBody,
          });

          const cloneResponse = await proxmoxClient.post<{ data: string }>(
            cloneEndpoint,
            cloneBody
          );
          cloneUpid = cloneResponse.data.data;
          bulkCloneDiagLog('golden seed — clone task started', {
            jobId: params.jobId,
            clonePath: 'golden_seed',
            vmid,
            node: params.node,
            upid: cloneUpid,
          });
          goldenLog('1/8 clone-seed', 'clone task started', {
            jobId: params.jobId,
            vmid,
            node: params.node,
            upid: cloneUpid,
          });
          resolve();
        } catch (err) {
          const proxmoxError = resolveCloneErrorMessage(err);
          bulkCloneDiagLog('golden seed — clone request failed', {
            jobId: params.jobId,
            clonePath: 'golden_seed',
            node: params.node,
            sourceTemplateId: params.sourceTemplateId,
            proxmoxError,
          });
          goldenLog('1/8 clone-seed', 'clone request failed', {
            jobId: params.jobId,
            node: params.node,
            sourceTemplateId: params.sourceTemplateId,
            error: proxmoxError,
          });
          reject(err);
        }
      });
    });

    // Poll inside the retry wrapper — a worker error here triggers a retry
    // with a brand-new VMID on the next iteration.
    const cloneResult = await pollTaskWithCleanup(cloneUpid, params.node, vmid, true);
    bulkCloneDiagLog('golden seed — clone task finished', {
      jobId: params.jobId,
      clonePath: 'golden_seed',
      vmid,
      node: params.node,
      upid: cloneUpid,
      outcome: cloneResult,
    });
    goldenLog('1/8 clone-seed', 'clone task finished', {
      jobId: params.jobId,
      vmid,
      node: params.node,
      upid: cloneUpid,
      outcome: cloneResult,
    });
    if (cloneResult !== 'success') {
      throw new Error(`Golden seed clone failed (outcome: ${cloneResult}).`);
    }
  }, { jobId: params.jobId, vmName: params.vmName, node: params.node });

  try {
    const seedDiag = await fetchSourceVmDiagnostics(params.node, vmid);
    bulkCloneDiagLog('golden seed — disk config after seed clone (before software/sysprep)', {
      jobId: params.jobId,
      clonePath: 'golden_seed',
      seedVmid: vmid,
      node: params.node,
      seedDisks: seedDiag.disks,
      seedDiskStorage: summarizeDiskPlacement(seedDiag),
      seedBios: seedDiag.bios,
      seedMachine: seedDiag.machine,
    });
  } catch (diagErr) {
    bulkCloneDiagLog('golden seed — failed to fetch config after seed clone', {
      jobId: params.jobId,
      seedVmid: vmid,
      node: params.node,
      error: diagErr instanceof Error ? diagErr.message : String(diagErr),
    });
  }

  const configUpdates: Record<string, unknown> = {};
  if (params.cpuCores !== params.templateCpuCores) configUpdates['cores'] = params.cpuCores;
  if (params.memoryGb !== params.templateMemoryGb) {
    configUpdates['memory'] = Math.round(params.memoryGb * 1024);
  }
  if (Object.keys(configUpdates).length > 0) {
    goldenLog('1/8 clone-seed', 'applying config overrides', {
      jobId: params.jobId, vmid, node: params.node, configUpdates,
    });
    await proxmoxClient.post(`/nodes/${params.node}/qemu/${vmid}/config`, configUpdates);
  }

  if (params.cloneType === 'dedicated_storage' && params.diskGb > params.templateDiskGb) {
    const extraGb = params.diskGb - params.templateDiskGb;
    const resizeResponse = await proxmoxClient.put<{ data: string }>(
      `/nodes/${params.node}/qemu/${vmid}/resize`,
      { disk: 'scsi0', size: `+${extraGb}G` }
    );
    await pollTaskWithCleanup(resizeResponse.data.data, params.node, vmid, false);
  }

  const power = await proxmoxClient.get<{ data: { status: string } }>(
    `/nodes/${params.node}/qemu/${vmid}/status/current`
  );
  goldenLog('1/8 clone-seed', 'seed ready after clone', {
    jobId: params.jobId,
    vmid,
    node: params.node,
    powerState: power.data.data.status,
  });

  return vmid;
}

async function deleteProxmoxVm(node: string, vmid: number): Promise<void> {
  const result = await retryProxmoxDelete(node, vmid);
  logger.info('[Golden] deleted Proxmox VM/template', { vmid, node, outcome: result });
}

/**
 * Build an ephemeral golden template: clone seed → Hyper-V (optional) → software → Sysprep → convert.
 */
export async function buildGoldenTemplate(
  job: IVMJob,
  adminId: mongoose.Types.ObjectId
): Promise<{ goldenTemplateVmid: number; node: string }> {
  const specs = job.requestedSpecs;
  const node = specs.templateNode!;
  const softwareIds = specs.softwareIds ?? [];
  const seedName = `racko-golden-seed-${job._id.toString().slice(-8)}`;
  const jobId = job._id.toString();
  const buildStarted = Date.now();

  await VMJob.findByIdAndUpdate(job._id, { phase: 'building_golden_image' });

  goldenLog('0/8 start', 'building golden template', {
    jobId,
    node,
    seedName,
    baseTemplateId: specs.templateId,
    baseTemplateName: specs.templateName,
    cloneType: specs.cloneType,
    vmCount: specs.count,
    softwareCount: softwareIds.length,
    softwareIds: softwareIds.map((id) => id.toString()),
    enableVirtualization: specs.enableVirtualization ?? false,
    cpuCores: specs.cpuCores,
    memoryGb: specs.memoryGb,
    diskGb: specs.diskGb,
  });

  if (!specs.templateNode) {
    goldenLog('0/8 start', 'ABORT — templateNode missing on job', { jobId });
    throw new Error('templateNode is missing on job — cannot build golden image.');
  }

  let seedVmid: number | undefined;

  try {
    seedVmid = await cloneSeedVm({
      node,
      sourceTemplateId: specs.templateId,
      vmName: seedName,
      jobId,
      cloneType: specs.cloneType,
      cpuCores: specs.cpuCores,
      memoryGb: specs.memoryGb,
      diskGb: specs.diskGb,
      templateDiskGb: specs.templateDiskGb,
      templateCpuCores: specs.templateCpuCores,
      templateMemoryGb: specs.templateMemoryGb,
    });

    const tempVm = await VM.create({
      vmid: seedVmid,
      node,
      adminId,
      name: seedName,
      templateId: specs.templateId,
      templateName: specs.templateName,
      cloneType: specs.cloneType,
      allocatedCpu: specs.cpuCores,
      allocatedMemoryGb: specs.memoryGb,
      allocatedDiskGb: specs.diskGb,
      status: 'creating',
      proxmoxStatus: 'stopped',
      jobId: job._id,
      haEnabled: false,
      enableVirtualization: specs.enableVirtualization ?? false,
      hyperVStatus: specs.enableVirtualization ? 'pending' : 'disabled',
      hyperVStatusChangedAt: new Date(),
      hyperVAttemptCount: 0,
      softwareInstalls: [],
    });

    try {
      if (specs.enableVirtualization) {
        goldenLog('2/8 hyperv', 'enabling Hyper-V on seed', { jobId, vmid: seedVmid, node });
        const hyperStarted = Date.now();
        const hyperResult = await provisionHyperVForVM({
          vmObjectId: tempVm._id,
          node,
          vmid: seedVmid,
          adminId,
          vmName: seedName,
        });
        goldenLog('2/8 hyperv', 'Hyper-V step finished', {
          jobId,
          vmid: seedVmid,
          node,
          result: hyperResult,
          elapsedMs: Date.now() - hyperStarted,
        });
        if (hyperResult !== 'enabled') {
          throw new Error('Hyper-V enable failed on golden seed VM.');
        }
      } else {
        goldenLog('2/8 hyperv', 'skipped — not requested', { jobId, vmid: seedVmid, node });
      }

      if (softwareIds.length > 0) {
        goldenLog('3/8 software', 'installing software on seed', {
          jobId,
          vmid: seedVmid,
          node,
          packageCount: softwareIds.length,
        });
        const swStarted = Date.now();
        await installSoftwareOnGuest({ node, vmid: seedVmid, softwareIds, jobId });
        goldenLog('3/8 software', 'software install finished', {
          jobId,
          vmid: seedVmid,
          node,
          elapsedMs: Date.now() - swStarted,
        });
      } else {
        goldenLog('3/8 software', 'skipped — no packages selected', { jobId, vmid: seedVmid, node });
      }

      goldenLog('4/8 sysprep', 'running Sysprep on seed', {
        jobId,
        vmid: seedVmid,
        node,
        powerStateBeforeSysprep: await proxmoxClient
          .get<{ data: { status: string } }>(`/nodes/${node}/qemu/${seedVmid}/status/current`)
          .then((r) => r.data.data.status)
          .catch(() => 'unknown'),
      });
      const sysprepStarted = Date.now();
      await runSysprepAndShutdown(node, seedVmid, jobId);
      goldenLog('4/8 sysprep', 'Sysprep finished — VM stopped', {
        jobId,
        vmid: seedVmid,
        node,
        elapsedMs: Date.now() - sysprepStarted,
      });
    } finally {
      await VM.deleteOne({ _id: tempVm._id });
      goldenLog('cleanup', 'removed temporary seed MongoDB record', { jobId, vmid: seedVmid, node });
    }

    goldenLog('5/8 convert', 'converting seed to template', {
      jobId,
      vmid: seedVmid,
      node,
      powerStateBeforeConvert: await proxmoxClient
        .get<{ data: { status: string } }>(`/nodes/${node}/qemu/${seedVmid}/status/current`)
        .then((r) => r.data.data.status)
        .catch(() => 'unknown'),
    });
    const convertResponse = await proxmoxClient.post<{ data: string }>(
      `/nodes/${node}/qemu/${seedVmid}/template`,
      {}
    );
    const convertUpid = convertResponse.data.data;
    goldenLog('5/8 convert', 'template conversion task started', {
      jobId,
      vmid: seedVmid,
      node,
      upid: convertUpid,
    });
    bulkCloneDiagLog('golden seed — template conversion task started', {
      jobId,
      clonePath: 'golden_seed',
      seedVmid,
      node,
      upid: convertUpid,
    });

    const convertResult = await pollTaskWithCleanup(convertUpid, node, seedVmid, false);
    bulkCloneDiagLog('golden seed — template conversion task finished', {
      jobId,
      clonePath: 'golden_seed',
      seedVmid,
      node,
      upid: convertUpid,
      outcome: convertResult,
    });
    goldenLog('5/8 convert', 'template conversion task finished', {
      jobId,
      vmid: seedVmid,
      node,
      upid: convertUpid,
      outcome: convertResult,
    });
    if (convertResult !== 'success') {
      throw new Error(`Golden template conversion failed (outcome: ${convertResult}).`);
    }

    let goldenTemplateDiag;
    try {
      goldenTemplateDiag = await fetchSourceVmDiagnostics(node, seedVmid);
      bulkCloneDiagLog('golden template ready — disk config after convert (compare with base template)', {
        jobId,
        clonePath: 'golden_delivery_source',
        goldenTemplateVmid: seedVmid,
        node,
        templateName: seedName,
        baseTemplateId: specs.templateId,
        cloneType: specs.cloneType,
        fullClone: specs.cloneType === 'dedicated_storage',
        goldenIsTemplate: goldenTemplateDiag.template === 1,
        goldenPowerState: goldenTemplateDiag.powerState,
        goldenDisks: goldenTemplateDiag.disks,
        goldenDiskStorage: summarizeDiskPlacement(goldenTemplateDiag),
        goldenBios: goldenTemplateDiag.bios,
        goldenMachine: goldenTemplateDiag.machine,
      });
    } catch (diagErr) {
      bulkCloneDiagLog('golden template ready — failed to fetch config after convert', {
        jobId,
        goldenTemplateVmid: seedVmid,
        node,
        error: diagErr instanceof Error ? diagErr.message : String(diagErr),
      });
    }

    goldenLog('5/8 convert', 'seed converted to template', {
      jobId,
      vmid: seedVmid,
      node,
      templateName: seedName,
      totalElapsedMs: Date.now() - buildStarted,
    });

    await VMJob.findByIdAndUpdate(job._id, {
      goldenTemplateVmid: seedVmid,
      goldenTemplateNode: node,
      phase: 'cloning_vms',
    });

    return { goldenTemplateVmid: seedVmid, node };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    goldenLog('ERROR', 'golden template build failed', {
      jobId,
      node,
      seedVmid,
      seedName,
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
      elapsedMs: Date.now() - buildStarted,
    });
    if (seedVmid !== undefined) {
      goldenLog('cleanup', 'deleting failed seed VM from Proxmox', { jobId, vmid: seedVmid, node });
      try {
        await deleteProxmoxVm(node, seedVmid);
      } catch (cleanupErr) {
        logger.error('[Golden] failed to purge-delete seed VM after build failure', {
          jobId,
          vmid: seedVmid,
          node,
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
    }
    throw err;
  }
}

/** Delete the ephemeral golden template after bulk clones are done. */
export async function deleteGoldenTemplate(node: string, vmid: number, jobId?: string): Promise<void> {
  goldenLog('8/8 cleanup', 'deleting ephemeral golden template', { jobId, vmid, node });
  try {
    await deleteProxmoxVm(node, vmid);
  } catch (err) {
    logger.error('[Golden] failed to purge-delete ephemeral golden template after retries', {
      jobId,
      vmid,
      node,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
