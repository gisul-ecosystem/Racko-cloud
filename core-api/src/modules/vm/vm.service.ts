import type { Request } from 'express';
import mongoose from 'mongoose';
import { proxmoxClient } from '../../utils/proxmoxClient';
import { logger } from '../../utils/logger';
import { VM } from './vm.model';
import { VMJob } from './vmJob.model';
import { VMEvent } from './vmEvent.model';
import { validateResources } from './helpers/resourceValidator';
import { pollTask } from './helpers/taskPoller';
import { processBulkCreation } from './helpers/bulkProcessor';
import { retryProxmoxDelete } from './helpers/deleteRetry';
import {
  VMNotFoundError,
  VMOwnershipError,
  VMOperationError,
  TemplateNotFoundError,
  InsufficientResourcesError,
} from '../../utils/errors';
import type {
  CreateVMDto,
  ProxmoxTemplate,
  TemplateDetails,
  VMOperationResult,
  VMStatus,
  VMFilters,
  VMDetails,
  ProxmoxVMCurrentStatus,
  ProxmoxNetworkInterface,
  ProxmoxNodeRaw,
} from './vm.types';
import type { IVM } from './vm.model';
import type { IVMJob } from './vmJob.model';
import type { IVMEvent } from './vmEvent.model';
import type { AuthenticatedRequest } from '../../types';

// ─── Private helpers ──────────────────────────────────────────────────────────

function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return 'just started';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(' ') : 'just started';
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  return req.ip ?? 'unknown';
}

function getUserAgent(req: Request): string {
  return req.headers['user-agent'] ?? 'unknown';
}

/**
 * Check VM ownership. Super admins bypass ownership check.
 */
function assertOwnership(vm: IVM, requestingUserId: string, requestingRole: string): void {
  if (requestingRole === 'super_admin') return;
  if (vm.adminId.toString() !== requestingUserId) {
    throw new VMOwnershipError('You do not have permission to access this VM.');
  }
}

export class VMService {
  /**
   * Fetch all templates from ALL nodes dynamically.
   * Filters template === 1, deduplicates by vmid, sorts by name.
   */
  async getTemplates(): Promise<ProxmoxTemplate[]> {
    const nodesResponse = await proxmoxClient.get<{ data: ProxmoxNodeRaw[] }>('/nodes');
    const onlineNodes = nodesResponse.data.data.filter((n) => n.status === 'online');

    const results = await Promise.allSettled(
      onlineNodes.map((node) =>
        proxmoxClient
          .get<{ data: Array<Omit<ProxmoxTemplate, 'node'>> }>(`/nodes/${node.node}/qemu`)
          .then((r) =>
            r.data.data
              .filter((vm) => vm.template === 1)
              .map((vm) => ({ ...vm, node: node.node }))
          )
      )
    );

    const allTemplates: ProxmoxTemplate[] = [];
    const seenVmids = new Set<number>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        for (const tpl of result.value) {
          if (!seenVmids.has(tpl.vmid)) {
            seenVmids.add(tpl.vmid);
            allTemplates.push({
              vmid: tpl.vmid,
              name: tpl.name,
              node: tpl.node,
              cpu: tpl.cpu,
              memory: tpl.memory,
              disk: tpl.disk,
              maxdisk: tpl.maxdisk,
              status: tpl.status,
              template: tpl.template,
            });
          }
        }
      } else {
        logger.warn('Failed to fetch templates from node', {
          node: onlineNodes[i]?.node ?? 'unknown',
          reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    return allTemplates.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get full config details for a specific template.
   */
  async getTemplateDetails(templateId: number): Promise<TemplateDetails> {
    const templates = await this.getTemplates();
    const template = templates.find((t) => t.vmid === templateId);

    if (!template) {
      throw new TemplateNotFoundError(`Template ${templateId} not found.`);
    }

    const configResponse = await proxmoxClient.get<{
      data: { cores?: number; memory?: number; scsi0?: string; ostype?: string; description?: string; name?: string };
    }>(`/nodes/${template.node}/qemu/${templateId}/config`);

    const cfg = configResponse.data.data;

    // Parse disk size from scsi0 config string (e.g. "local-lvm:vm-100-disk-0,size=32G")
    let diskGb = bytesToGb(template.maxdisk);
    if (cfg.scsi0) {
      const sizeMatch = /size=(\d+)G/i.exec(cfg.scsi0);
      if (sizeMatch?.[1]) diskGb = parseInt(sizeMatch[1], 10);
    }

    return {
      vmid: template.vmid,
      name: template.name,
      node: template.node,
      cpuCores: cfg.cores ?? template.cpu ?? 1,
      memoryGb: cfg.memory ? cfg.memory / 1024 : bytesToGb(template.memory),
      diskGb,
      osType: cfg.ostype,
      description: cfg.description,
    };
  }

  /**
   * Create one or more VMs.
   * All creations go through the async job system — returns jobId immediately.
   * This prevents gateway timeouts and duplicate VM creation on retries.
   */
  async createVM(
    dto: CreateVMDto,
    adminId: mongoose.Types.ObjectId,
    _req: Request
  ): Promise<{ jobId: string }> {
    // Get template details — validates template exists
    const templateDetails = await this.getTemplateDetails(dto.templateId);

    const templateSpecs = {
      cpuCores: templateDetails.cpuCores,
      memoryGb: templateDetails.memoryGb,
      diskGb: templateDetails.diskGb,
    };

    // Resolve final specs
    const cpuCores = dto.cpuCores ?? templateSpecs.cpuCores;
    const memoryGb = dto.memoryGb ?? templateSpecs.memoryGb;
    const diskGb = dto.diskGb ?? templateSpecs.diskGb;

    // Validate resources
    const validation = await validateResources(dto, templateSpecs);
    if (!validation.canCreate) {
      throw new InsufficientResourcesError(
        validation.reason ?? 'Insufficient resources.',
        dto.count,
        validation.maxPossibleCount,
        'resources'
      );
    }

    // Always create a job — single or bulk, same async path
    const job = await VMJob.create({
      adminId,
      type: dto.count === 1 ? 'single_create' : 'bulk_create',
      status: 'pending',
      total: dto.count,
      completed: 0,
      failed: 0,
      pending: dto.count,
      vmIds: [],
      failedVmids: [],
      requestedSpecs: {
        templateId: dto.templateId,
        templateName: templateDetails.name,
        cloneType: dto.cloneType,
        cpuCores,
        memoryGb,
        diskGb,
        templateDiskGb: templateSpecs.diskGb,
        namePrefix: dto.name,
        count: dto.count,
      },
      jobErrors: [],
      startedAt: new Date(),
    });

    logger.info('VM creation job created', {
      jobId: job._id.toString(),
      adminId: adminId.toString(),
      count: dto.count,
      templateId: dto.templateId,
      type: job.type,
    });

    // Trigger async — do NOT await
    // QUEUE_SLOT: replace with message queue job (RabbitMQ/BullMQ)
    processBulkCreation(job, adminId).catch((err: unknown) => {
      logger.error('Unhandled VM creation error', {
        jobId: job._id.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return { jobId: job._id.toString() };
  }

  /**
   * Delete a VM. Stops it first if running. Soft delete only.
   * - Idempotent: throws if already deleting or deleted
   * - Retries Proxmox delete with exponential backoff (see deleteRetry.ts)
   * - On Proxmox "already gone" → treats as success
   * - On all retries exhausted → sets status to delete_failed, saves error, rethrows
   * - Checks pollTask result — failure throws instead of silently continuing
   */
  async deleteVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<void> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);

    assertOwnership(vm, adminId.toString(), authReq.user.role);

    // Idempotency guards — prevent double-deletion races
    if (vm.status === 'deleting') {
      throw new VMOperationError('VM deletion is already in progress.', vm.status, 'stopped');
    }
    if (vm.status === 'deleted') {
      throw new VMOperationError('VM is already deleted.', vm.status, 'stopped');
    }

    const previousStatus = vm.status;

    // Stop VM first if running
    if (vm.status === 'running') {
      logger.info('Stopping VM before deletion', { vmid: vm.vmid, node: vm.node });
      try {
        const stopResponse = await proxmoxClient.post<{ data: string }>(
          `/nodes/${vm.node}/qemu/${vm.vmid}/status/stop`,
          {}
        );
        await pollTask(stopResponse.data.data, vm.node);
      } catch (stopErr) {
        // Stop failed — restore previous status so VM is not left in limbo
        vm.status = previousStatus;
        await vm.save();
        throw stopErr;
      }
    }

    // Mark as deleting
    vm.status = 'deleting';
    await vm.save();

    // Delete from Proxmox with retry + backoff
    try {
      const deleteResult = await retryProxmoxDelete(vm.node, vm.vmid);

      if (deleteResult === 'deleted') {
        // Poll the delete task only when Proxmox actually ran it
        // Note: retryProxmoxDelete handles the raw delete; Proxmox delete is synchronous
        // for stopped VMs so no UPID is returned — nothing to poll here.
      }
      // 'already_gone' → VM was already absent from Proxmox, proceed to mark deleted

    } catch (deleteErr) {
      // All retries exhausted — mark as delete_failed so user can see and retry
      vm.status = 'delete_failed';
      vm.lastError = deleteErr instanceof Error ? deleteErr.message : String(deleteErr);
      vm.deleteAttempts = (vm.deleteAttempts ?? 0) + 1;
      await vm.save();

      logger.error('VM deletion failed after all retries', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        node: vm.node,
        attempts: vm.deleteAttempts,
        error: vm.lastError,
      });

      throw deleteErr;
    }

    // Soft delete — mark as deleted in MongoDB
    vm.status = 'deleted';
    vm.deletedAt = new Date();
    vm.lastError = undefined;
    await vm.save();

    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'VM_DELETED',
      status: 'success',
      details: { node: vm.node },
      ipAddress: ip,
      userAgent: ua,
    });

    logger.info('VM deleted', { vmId: vmId.toString(), vmid: vm.vmid, node: vm.node });
  }

  /**
   * Start a VM (graceful).
   */
  async startVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (vm.status === 'running') {
      throw new VMOperationError('VM is already running.', vm.status, 'stopped');
    }

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/start`,
      {}
    );
    const upid = response.data.data;
    await pollTask(upid, vm.node);

    vm.status = 'running';
    vm.proxmoxStatus = 'running';
    await vm.save();

    await VMEvent.create({
      vmId: vm._id, vmid: vm.vmid, adminId,
      event: 'VM_STARTED', status: 'success',
      details: { node: vm.node }, ipAddress: ip, userAgent: ua,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'start', taskId: upid };
  }

  /**
   * Stop a VM (graceful shutdown).
   */
  async stopVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (vm.status === 'stopped') {
      throw new VMOperationError('VM is already stopped.', vm.status, 'running');
    }

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/shutdown`,
      {}
    );
    const upid = response.data.data;
    await pollTask(upid, vm.node);

    vm.status = 'stopped';
    vm.proxmoxStatus = 'stopped';
    await vm.save();

    await VMEvent.create({
      vmId: vm._id, vmid: vm.vmid, adminId,
      event: 'VM_STOPPED', status: 'success',
      details: { node: vm.node }, ipAddress: ip, userAgent: ua,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'stop', taskId: upid };
  }

  /**
   * Force stop a VM (hard kill — immediate).
   */
  async forceStopVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (vm.status === 'stopped') {
      throw new VMOperationError('VM is already stopped.', vm.status, 'running');
    }

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/stop`,
      {}
    );
    const upid = response.data.data;
    await pollTask(upid, vm.node);

    vm.status = 'stopped';
    vm.proxmoxStatus = 'stopped';
    await vm.save();

    await VMEvent.create({
      vmId: vm._id, vmid: vm.vmid, adminId,
      event: 'VM_FORCE_STOPPED', status: 'success',
      details: { node: vm.node }, ipAddress: ip, userAgent: ua,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'force-stop', taskId: upid };
  }

  /**
   * Restart a VM (graceful reboot).
   */
  async restartVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (vm.status !== 'running') {
      throw new VMOperationError('VM must be running to restart.', vm.status, 'running');
    }

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/reboot`,
      {}
    );
    const upid = response.data.data;
    await pollTask(upid, vm.node);

    await VMEvent.create({
      vmId: vm._id, vmid: vm.vmid, adminId,
      event: 'VM_RESTARTED', status: 'success',
      details: { node: vm.node }, ipAddress: ip, userAgent: ua,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'restart', taskId: upid };
  }

  /**
   * Reset a VM (hard reset — like pressing physical reset button).
   */
  async resetVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMOperationResult> {
    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (vm.status !== 'running') {
      throw new VMOperationError('VM must be running to reset.', vm.status, 'running');
    }

    const response = await proxmoxClient.post<{ data: string }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/reset`,
      {}
    );
    const upid = response.data.data;
    await pollTask(upid, vm.node);

    await VMEvent.create({
      vmId: vm._id, vmid: vm.vmid, adminId,
      event: 'VM_RESET', status: 'success',
      details: { node: vm.node }, ipAddress: ip, userAgent: ua,
    });

    return { success: true, vmid: vm.vmid, node: vm.node, operation: 'reset', taskId: upid };
  }

  /**
   * Get live VM status from Proxmox + try to get IP from guest agent.
   */
  async getVMStatus(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMStatus> {
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    const statusResponse = await proxmoxClient.get<{ data: ProxmoxVMCurrentStatus }>(
      `/nodes/${vm.node}/qemu/${vm.vmid}/status/current`
    );
    const live = statusResponse.data.data;

    // Try to get IP from guest agent (best-effort)
    let ipAddress = vm.ipAddress;
    try {
      const agentResponse = await proxmoxClient.get<{
        data: { result: ProxmoxNetworkInterface[] };
      }>(`/nodes/${vm.node}/qemu/${vm.vmid}/agent/network-get-interfaces`);

      const interfaces = agentResponse.data.data.result ?? [];
      for (const iface of interfaces) {
        if (iface.name === 'lo') continue;
        const ipv4 = iface['ip-addresses']?.find(
          (a) => a['ip-address-type'] === 'ipv4' && !a['ip-address'].startsWith('127.')
        );
        if (ipv4) {
          ipAddress = ipv4['ip-address'];
          // Update MongoDB if IP changed
          if (ipAddress !== vm.ipAddress) {
            await VM.findByIdAndUpdate(vmId, { ipAddress });
          }
          break;
        }
      }
    } catch {
      // Guest agent not available — use stored IP
    }

    // Update proxmox status in MongoDB
    const mappedStatus = mapProxmoxStatus(live.status);
    if (mappedStatus !== vm.status) {
      await VM.findByIdAndUpdate(vmId, { status: mappedStatus, proxmoxStatus: live.status });
    }

    return {
      vmid: vm.vmid,
      node: vm.node,
      status: live.status,
      cpu: {
        usagePercent: Math.round(live.cpu * 10000) / 100,
        allocated: vm.allocatedCpu,
      },
      memory: {
        usedGb: bytesToGb(live.mem),
        allocatedGb: bytesToGb(live.maxmem),
        usagePercent: live.maxmem > 0 ? Math.round((live.mem / live.maxmem) * 10000) / 100 : 0,
      },
      disk: {
        usedGb: bytesToGb(live.disk),
        allocatedGb: bytesToGb(live.maxdisk),
      },
      uptime: {
        seconds: live.uptime,
        formatted: formatUptime(live.uptime),
      },
      ipAddress,
    };
  }

  /**
   * Get all VMs owned by an admin (excludes deleted).
   */
  async getMyVMs(adminId: mongoose.Types.ObjectId, filters?: VMFilters): Promise<mongoose.FlattenMaps<IVM>[]> {
    const query: Record<string, unknown> = { adminId };

    if (filters?.status) query['status'] = filters.status;
    if (filters?.cloneType) query['cloneType'] = filters.cloneType;
    if (filters?.node) query['node'] = filters.node;

    return VM.find(query).sort({ createdAt: -1 }).lean();
  }

  /**
   * Get all VMs across all admins — super_admin only.
   */
  async getAllVMsAdmin(filters?: VMFilters): Promise<mongoose.FlattenMaps<IVM>[]> {
    const query: Record<string, unknown> = {};

    if (filters?.status) query['status'] = filters.status;
    if (filters?.cloneType) query['cloneType'] = filters.cloneType;
    if (filters?.node) query['node'] = filters.node;

    return VM.find(query).sort({ createdAt: -1 }).lean();
  }

  /**
   * Get full VM details: stored specs + live status + recent events.
   */
  async getVMDetails(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VMDetails> {
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    // Get live status (best-effort)
    let liveStatus: VMStatus | undefined;
    try {
      liveStatus = await this.getVMStatus(vmId, adminId, req);
    } catch {
      // Live status unavailable — return stored data only
    }

    // Get recent events
    const recentEvents = await VMEvent.find({ vmId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return {
      vm: {
        id: vm._id.toString(),
        vmid: vm.vmid,
        node: vm.node,
        name: vm.name,
        description: vm.description,
        status: vm.status,
        cloneType: vm.cloneType,
        allocatedCpu: vm.allocatedCpu,
        allocatedMemoryGb: vm.allocatedMemoryGb,
        allocatedDiskGb: vm.allocatedDiskGb,
        ipAddress: vm.ipAddress,
        macAddress: vm.macAddress,
        haEnabled: vm.haEnabled,
        createdAt: vm.createdAt,
        updatedAt: vm.updatedAt,
      },
      liveStatus,
      recentEvents: recentEvents.map((e) => ({
        event: e.event,
        status: e.status,
        createdAt: e.createdAt,
        details: e.details,
      })),
    };
  }

  /**
   * List all jobs for an admin. Super admin sees all jobs.
   */
  async listJobs(
    adminId: mongoose.Types.ObjectId,
    req: Request,
    limit = 20
  ): Promise<IVMJob[]> {
    const authReq = req as AuthenticatedRequest;
    const query =
      authReq.user.role === 'super_admin'
        ? {}
        : { adminId };
    return VMJob.find(query).sort({ createdAt: -1 }).limit(limit).lean() as unknown as IVMJob[];
  }

  /**
   * Get bulk job status. Ownership check enforced.
   */
  async getJobStatus(
    jobId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<IVMJob> {
    const authReq = req as AuthenticatedRequest;

    const job = await VMJob.findById(jobId);
    if (!job) throw new VMNotFoundError(`Job ${jobId.toString()} not found.`);

    if (authReq.user.role !== 'super_admin' && job.adminId.toString() !== adminId.toString()) {
      throw new VMOwnershipError('You do not have permission to access this job.');
    }

    return job;
  }

  /**
   * Get audit trail for a specific VM. Last 50 events.
   */
  async getVMEvents(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<mongoose.FlattenMaps<IVMEvent>[]> {
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    return VMEvent.find({ vmId }).sort({ createdAt: -1 }).limit(50).lean();
  }
}

export const vmService = new VMService();

// ─── Private helpers ──────────────────────────────────────────────────────────

function mapProxmoxStatus(
  proxmoxStatus: string
): 'running' | 'stopped' | 'paused' | 'suspended' | 'error' {
  switch (proxmoxStatus) {
    case 'running': return 'running';
    case 'stopped': return 'stopped';
    case 'paused': return 'paused';
    case 'suspended': return 'suspended';
    default: return 'error';
  }
}
