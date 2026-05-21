import mongoose from 'mongoose';
import { proxmoxClient } from '../../../utils/proxmoxClient';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { VM } from '../vm.model';
import { VMJob } from '../vmJob.model';
import { VMEvent } from '../vmEvent.model';
import { selectNodesForBulk, selectNode } from './placementEngine';
import { pollTaskWithCleanup } from './taskPoller';
import { ProxmoxConnectionError } from '../../../utils/errors';
import type { IVMJob } from '../vmJob.model';
import type { BulkVMSpec } from '../vm.types';

// QUEUE_SLOT: replace direct async call with message queue job (RabbitMQ/BullMQ)
// EVENT_SLOT: emit 'vm.bulk_created' event to message queue

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
          index: globalIndex,
          node: allocation.node,
          templateId: specs.templateId,
          cloneType: specs.cloneType,
          cpuCores: specs.cpuCores,
          memoryGb: specs.memoryGb,
          diskGb: specs.diskGb,
          templateDiskGb: specs.templateDiskGb,  // actual template disk size from Proxmox
          templateCpuCores: specs.cpuCores,
          templateMemoryGb: specs.memoryGb,
          adminId,
          jobId,
          description: undefined,
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

    // Pre-fetch ALL VMIDs sequentially upfront — never call nextid inside parallel code.
    // Proxmox needs a small delay between calls to register each ID before the next request.
    const vmids: number[] = [];
    for (let i = 0; i < vmSpecs.length; i++) {
      const response = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
      vmids.push(response.data.data);
      await sleep(100); // ensure Proxmox registers each before next call
    }

    logger.info('Pre-fetched VMIDs for bulk job', {
      jobId: jobId.toString(),
      count: vmids.length,
    });

    for (const batch of batches) {
      const batchStartIndex = vmSpecs.indexOf(batch[0]!);
      const results = await Promise.allSettled(
        batch.map((spec, i) => createSingleVM(spec, vmids[batchStartIndex + i]!))
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

              // Get a fresh VMID for the rerouted VM
              const nextIdResponse = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
              await sleep(100);
              const newVmid = nextIdResponse.data.data;

              spec.node = rerouteNode.node;
              const retryResult = await createSingleVM(spec, newVmid);

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
 * vmid is pre-fetched by the caller — never call nextid inside parallel code.
 * Returns the MongoDB ObjectId of the created VM.
 */
async function createSingleVM(spec: BulkVMSpec, vmid: number): Promise<mongoose.Types.ObjectId> {
  // Get best storage pool on target node
  const nodeResourcesResponse = await proxmoxClient.get<{
    data: Array<{ storage: string; avail: number; active: number; enabled: number; content: string }>;
  }>(`/nodes/${spec.node}/storage`);

  const activeStorage = nodeResourcesResponse.data.data
    .filter((s) => s.active === 1 && s.enabled === 1 && s.content?.includes('images'))
    .sort((a, b) => b.avail - a.avail);

  const storagePool = activeStorage[0]?.storage;

  // Clone template
  const cloneBody: Record<string, unknown> = {
    newid: vmid,
    name: spec.vmName,
    full: spec.cloneType === 'dedicated_storage' ? 1 : 0,
    target: spec.node,
  };
  if (storagePool) cloneBody['storage'] = storagePool;

  const cloneResponse = await proxmoxClient.post<{ data: string }>(
    `/nodes/${spec.node}/qemu/${spec.templateId}/clone`,
    cloneBody
  );

  const cloneUpid = cloneResponse.data.data;

  // Poll clone task — cleanup orphan on failure
  await pollTaskWithCleanup(cloneUpid, spec.node, vmid, true);

  // Apply config overrides if needed
  const configUpdates: Record<string, unknown> = {};
  if (spec.cpuCores !== spec.templateCpuCores) configUpdates['cores'] = spec.cpuCores;
  if (spec.memoryGb !== spec.templateMemoryGb) configUpdates['memory'] = Math.round(spec.memoryGb * 1024);

  if (Object.keys(configUpdates).length > 0) {
    await proxmoxClient.post(`/nodes/${spec.node}/qemu/${vmid}/config`, configUpdates);
  }

  // Resize disk if needed (dedicated_storage only)
  if (spec.cloneType === 'dedicated_storage' && spec.diskGb > spec.templateDiskGb) {
    const extraGb = spec.diskGb - spec.templateDiskGb;
    const resizeResponse = await proxmoxClient.put<{ data: string }>(
      `/nodes/${spec.node}/qemu/${vmid}/resize`,
      { disk: 'scsi0', size: `+${extraGb}G` }
    );
    await pollTaskWithCleanup(resizeResponse.data.data, spec.node, vmid, false);
  }

  // Save VM to MongoDB
  const vm = await VM.create({
    vmid,
    node: spec.node,
    adminId: spec.adminId,
    name: spec.vmName,
    description: spec.description,
    templateId: spec.templateId,
    templateName: spec.vmName, // will be updated with actual template name by caller
    cloneType: spec.cloneType,
    allocatedCpu: spec.cpuCores,
    allocatedMemoryGb: spec.memoryGb,
    allocatedDiskGb: spec.diskGb,
    status: 'stopped',
    proxmoxStatus: 'stopped',
    jobId: spec.jobId,
    haEnabled: false,
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

  // HA_SLOT: after VM creation, if vm.haEnabled, call Proxmox HA API to register VM
  // SNAPSHOT_SLOT: post-creation snapshot support
  // FIREWALL_SLOT: apply per-VM firewall rules after creation
  // BILLING_SLOT: emit resource allocation event for billing calculation
  // IP_POOL_SLOT: allocate static IP from pool and inject via cloud-init

  return vm._id;
}
