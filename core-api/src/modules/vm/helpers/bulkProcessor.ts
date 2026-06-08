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
import { ProxmoxConnectionError } from '../../../utils/errors';
import type { IVMJob } from '../vmJob.model';
import type { BulkVMSpec } from '../vm.types';

// QUEUE_SLOT: replace direct async call with message queue job (RabbitMQ/BullMQ)
// EVENT_SLOT: emit 'vm.bulk_created' event to message queue

/**
 * Mutex for VMID allocation — ensures only one VM fetches a VMID at a time.
 * This prevents duplicate IDs when multiple VMs in a batch run in parallel.
 * Only the VMID fetch + clone POST is serialized; the actual Proxmox clone
 * task runs asynchronously so all clones still execute in parallel.
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

  try {
    // Mark job as processing
    await VMJob.findByIdAndUpdate(jobId, { status: 'processing' });

    const specs = job.requestedSpecs;
    const count = specs.count;

    // Get node allocations from placement engine
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
      return;
    }

    // Build flat list of VM specs with node assignments
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
          templateDiskGb: specs.templateDiskGb,  // actual template disk size from Proxmox
          templateCpuCores: specs.templateCpuCores,  // actual template CPU from Proxmox
          templateMemoryGb: specs.templateMemoryGb,  // actual template RAM from Proxmox
          adminId,
          jobId,
          description: undefined,
          consoleUsername: specs.consoleUsername,
          passwordMode: specs.passwordMode,
          consolePassword: specs.consolePassword,
          dynamicUsernamePrefix: specs.dynamicUsernamePrefix,
          consoleProtocol: specs.consoleProtocol,
          enableVirtualization: specs.enableVirtualization ?? false,
          softwareIds: specs.softwareIds ?? [],
        });
        globalIndex++;
      }
    }

    // Process in batches
    const batchSize = config.VM_BULK_BATCH_SIZE;
    const batches: BulkVMSpec[][] = [];
    for (let i = 0; i < vmSpecs.length; i += batchSize) {
      batches.push(vmSpecs.slice(i, i + batchSize));
    }

    logger.info('Starting bulk VM creation', {
      jobId: jobId.toString(),
      total: vmSpecs.length,
      batches: batches.length,
      batchSize,
    });

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map((spec) => createSingleVM(spec))
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const spec = batch[i]!;

        if (result.status === 'fulfilled') {
          await VMJob.findByIdAndUpdate(jobId, {
            $inc: { completed: 1, pending: -1 },
            $push: { vmIds: result.value },
          });
        } else {
          const error = result.reason as Error;
          const errorMsg = error instanceof Error ? error.message : String(error);

          // If failure was node connectivity — attempt reroute to another node
          if (error instanceof ProxmoxConnectionError) {
            logger.warn('Node connectivity failure in bulk job — attempting reroute', {
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
                [spec.node]  // exclude the failed node
              );

              spec.node = rerouteNode.node;
              const retryResult = await createSingleVM(spec);

              await VMJob.findByIdAndUpdate(jobId, {
                $inc: { completed: 1, pending: -1 },
                $push: { vmIds: retryResult },
              });

              logger.info('VM rerouted and created successfully', {
                jobId: jobId.toString(),
                vmName: spec.vmName,
                newNode: rerouteNode.node,
              });
              continue;
            } catch (rerouteError) {
              logger.error('Reroute failed — recording as failed VM', {
                jobId: jobId.toString(),
                vmName: spec.vmName,
                error: rerouteError instanceof Error ? rerouteError.message : String(rerouteError),
              });
              // Fall through to failure recording below
            }
          }

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

      // Log batch progress
      const currentJob = await VMJob.findById(jobId).lean();
      if (currentJob) {
        logger.info('Bulk job batch completed', {
          jobId: jobId.toString(),
          completed: currentJob.completed,
          failed: currentJob.failed,
          pending: currentJob.pending,
        });
      }
    }

    // Determine final job status
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
  } catch (error) {
    // Top-level catch — never crash the app
    logger.error('Unexpected error in bulk processor', {
      jobId: jobId.toString(),
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      await VMJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        completedAt: new Date(),
      });
    } catch (updateError) {
      logger.error('Failed to update job status after bulk processor error', {
        jobId: jobId.toString(),
        error: updateError instanceof Error ? updateError.message : String(updateError),
      });
    }
  }
}

/**
 * Create a single VM as part of a bulk job.
 * Fetches its own VMID using a mutex to prevent duplicate IDs across parallel VMs.
 * The mutex only serializes the VMID fetch + clone POST (milliseconds).
 * The actual Proxmox clone task runs asynchronously — all clones execute in parallel.
 * Returns the MongoDB ObjectId of the created VM.
 */
async function createSingleVM(spec: BulkVMSpec): Promise<mongoose.Types.ObjectId> {
  // Resolve per-VM console credentials.
  // Username: in dynamic mode with a prefix set, becomes "<prefix>-<index>"
  // (e.g. "Admin-1", "Admin-2"); otherwise exactly what the user typed.
  // Password: fixed → shared value from the request; dynamic → unique per VM.
  const consoleUsername =
    spec.passwordMode === 'dynamic' && spec.dynamicUsernamePrefix
      ? `${spec.dynamicUsernamePrefix}-${spec.index}`
      : spec.consoleUsername;
  const consolePassword =
    spec.passwordMode === 'dynamic' ? generatePassword() : (spec.consolePassword ?? '');

  // Select storage pool for dedicated clones only.
  // Linked clones must use template storage — Proxmox enforces this, never send storage for them.
  // For dedicated clones: prefer shared storage (Ceph/NFS) for live-migration support,
  // fall back to local storage sorted by most free space.
  let storagePool: string | undefined;

  if (spec.cloneType === 'dedicated_storage') {
    const nodeResourcesResponse = await proxmoxClient.get<{
      data: Array<{ storage: string; avail: number; active: number; enabled: number; content: string; shared?: number; type?: string }>;
    }>(`/nodes/${spec.node}/storage`);

    const eligible = nodeResourcesResponse.data.data
      .filter((s) => s.active === 1 && s.enabled === 1 && s.content?.includes('images'));

    // Tier 1: shared storage (Ceph, NFS, etc.) — enables live migration
    const shared = eligible.filter((s) => s.shared === 1).sort((a, b) => b.avail - a.avail);
    // Tier 2: local storage — fallback
    const local = eligible.filter((s) => s.shared !== 1).sort((a, b) => b.avail - a.avail);

    storagePool = (shared[0] ?? local[0])?.storage;

    logger.info('[BulkVM] Storage selection', {
      vmName: spec.vmName,
      node: spec.node,
      cloneType: spec.cloneType,
      sharedPools: shared.map((s) => ({ storage: s.storage, availGb: Math.round(s.avail / 1024 / 1024 / 1024) })),
      localPools: local.map((s) => ({ storage: s.storage, availGb: Math.round(s.avail / 1024 / 1024 / 1024) })),
      selectedPool: storagePool ?? 'NONE — no eligible storage found',
    });
  }

  // Acquire mutex — fetch VMID and send clone POST atomically.
  // This ensures no two parallel VMs get the same VMID from Proxmox.
  let vmid!: number;
  let cloneUpid!: string;

  await new Promise<void>((resolve, reject) => {
    vmidMutex = vmidMutex.then(async () => {
      try {
        const response = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
        vmid = response.data.data;

        logger.info('[BulkVM] Allocated VMID', { vmName: spec.vmName, vmid, node: spec.node });

        const cloneBody: Record<string, unknown> = {
          newid: vmid,
          name: spec.vmName,
          full: spec.cloneType === 'dedicated_storage' ? 1 : 0,
          target: spec.node,
        };
        if (storagePool) cloneBody['storage'] = storagePool;

        logger.info('[BulkVM] Sending clone request', {
          vmName: spec.vmName,
          templateId: spec.templateId,
          vmid,
          node: spec.node,
          cloneBody,
        });

        const cloneResponse = await proxmoxClient.post<{ data: string }>(
          `/nodes/${spec.node}/qemu/${spec.templateId}/clone`,
          cloneBody
        );
        cloneUpid = cloneResponse.data.data;

        logger.info('[BulkVM] Clone task started — releasing mutex', {
          vmName: spec.vmName, vmid, node: spec.node, upid: cloneUpid,
        });

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  // Poll clone task — cleanup orphan only on definitive failure, not on unknown
  const cloneResult = await pollTaskWithCleanup(cloneUpid, spec.node, vmid, true);

  if (cloneResult === 'unknown') {
    // Network was lost during polling — we don't know if the clone succeeded.
    // Save the VM to MongoDB as 'creating' so it's not an orphan.
    // The reconciler will verify and update its status later.
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

  // Inject cloud-init credentials + apply any spec overrides.
  // ciuser/cipassword are always set so the VM uses the credentials the admin
  // chose (or the generated per-VM password) rather than the template defaults.
  const configUpdates: Record<string, unknown> = {
    ciuser: consoleUsername,
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

  // Resize disk if needed (dedicated_storage only)
  if (spec.cloneType === 'dedicated_storage' && spec.diskGb > spec.templateDiskGb) {
    const extraGb = spec.diskGb - spec.templateDiskGb;
    const resizeResponse = await proxmoxClient.put<{ data: string }>(
      `/nodes/${spec.node}/qemu/${vmid}/resize`,
      { disk: 'scsi0', size: `+${extraGb}G` }
    );
    const resizeResult = await pollTaskWithCleanup(resizeResponse.data.data, spec.node, vmid, false);
    if (resizeResult === 'unknown') {
      logger.warn('[BulkVM] Disk resize task outcome unknown — VM saved but disk size may not match requested', {
        vmName: spec.vmName,
        vmid,
        node: spec.node,
      });
      // Continue — VM was cloned, disk resize is best-effort
    }
  }

  // Resolve software names upfront so VM document is complete from creation
  const softwareNameMap = new Map<string, string>();
  if ((spec.softwareIds ?? []).length > 0) {
    const softwareDocs = await softwareService.getByIds(spec.softwareIds ?? []);
    for (const s of softwareDocs) {
      softwareNameMap.set(s._id.toString(), s.name);
    }
  }

  // Save VM to MongoDB
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
    hyperVStatus: spec.enableVirtualization ? 'pending' : 'disabled',
    hyperVStatusChangedAt: new Date(),
    hyperVAttemptCount: 0,
    softwareInstalls: (spec.softwareIds ?? []).map((id) => ({
      softwareId: id,
      name: softwareNameMap.get(id.toString()) ?? id.toString(),
      status: 'pending',
      sweeperAttempts: 0,
    })),
  });

  // Log audit event
  await VMEvent.create({
    vmId: vm._id,
    vmid,
    adminId: spec.adminId,
    event: 'VM_CREATED',
    status: 'success',
    details: { node: spec.node, cloneType: spec.cloneType, jobId: spec.jobId.toString() },
    ipAddress: 'bulk-job',
    userAgent: 'bulk-processor',
  });

  // Enable Hyper-V in the background (boots VM, runs PowerShell, reboots — minutes).
  // Fire-and-forget so VM creation completes fast; status is tracked on the VM
  // (hyperVStatus: pending → enabling → enabled/failed) and shown/polled in the UI.
  if (spec.enableVirtualization) {
    scheduleHyperVEnable({
      vmObjectId: vm._id,
      node: spec.node,
      vmid,
      adminId: spec.adminId,
      vmName: vm.name,
    });
  }

  // Software installation runs after HyperV (if requested) or independently.
  // The provisioner boots the VM, waits for guest agent, bootstraps Chocolatey,
  // and installs each package sequentially.
  if ((spec.softwareIds ?? []).length > 0) {
    if (spec.enableVirtualization) {
      // Chain: HyperV finishes first, then software install runs.
      // The HyperV provisioner calls scheduleSoftwareInstall on completion via
      // the queue — nothing extra needed here; we just schedule as a fallback
      // with a delay to give HyperV time to finish.
      setTimeout(() => {
        scheduleSoftwareInstall({
          vmObjectId: vm._id,
          node: spec.node,
          vmid,
          adminId: spec.adminId,
          vmName: vm.name,
        });
      }, 15 * 60 * 1000); // 15 min buffer for HyperV to complete
    } else {
      scheduleSoftwareInstall({
        vmObjectId: vm._id,
        node: spec.node,
        vmid,
        adminId: spec.adminId,
        vmName: vm.name,
      });
    }
  }

  // HA_SLOT: after VM creation, if vm.haEnabled, call Proxmox HA API to register VM
  // SNAPSHOT_SLOT: post-creation snapshot support
  // FIREWALL_SLOT: apply per-VM firewall rules after creation
  // BILLING_SLOT: emit resource allocation event for billing calculation
  // IP_POOL_SLOT: allocate static IP from pool and inject via cloud-init

  return vm._id;
}
