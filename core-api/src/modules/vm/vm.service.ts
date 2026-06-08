import type { Request } from 'express';
import mongoose from 'mongoose';
import { proxmoxClient } from '../../utils/proxmoxClient';
import { guacamoleClient, type GuacamoleProtocol } from '../../utils/guacamoleClient';
import { logger } from '../../utils/logger';
import { VM } from './vm.model';
import { VMJob } from './vmJob.model';
import { VMEvent } from './vmEvent.model';
import { validateResources } from './helpers/resourceValidator';
import { pollTask } from './helpers/taskPoller';
import { processBulkCreation } from './helpers/bulkProcessor';
import { retryProxmoxDelete } from './helpers/deleteRetry';
import { isWindowsOsType } from './helpers/hypervProvisioner';
import { scheduleHyperVEnable, scheduleHyperVDisable } from './helpers/hypervQueue';
import { isHyperVInProgress, updateHyperVStatus } from './helpers/hypervStatus';
import { softwareService } from '../software/software.service';
import {
  VMNotFoundError,
  VMOwnershipError,
  VMOperationError,
  TemplateNotFoundError,
  InsufficientResourcesError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import { User } from '../../models/user.model';
import type {
  CreateVMDto,
  ProxmoxTemplate,
  TemplateDetails,
  VMOperationResult,
  VMStatus,
  VMFilters,
  VMDetails,
  JobVMCredential,
  VirtualizationStatus,
  ProxmoxVMCurrentStatus,
  ProxmoxNetworkInterface,
  ProxmoxFsInfo,
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

/**
 * Derive the Guacamole console protocol from the template OS type.
 * Windows guests use RDP; everything else defaults to SSH.
 */
function deriveConsoleProtocol(osType?: string): 'rdp' | 'ssh' {
  const normalized = (osType ?? '').toLowerCase();
  return normalized.includes('win') ? 'rdp' : 'ssh';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fire-and-forget poll for a VM's private IP after it starts.
 *
 * Waits for the guest agent to come up, then queries network-get-interfaces and
 * stores the first address in the custnet1 range (10.100.x.x). All Proxmox/agent
 * errors are swallowed and retried — this never throws and never blocks the
 * caller (the start API responds immediately; the IP resolves in the background).
 */
async function startIpPolling(vm: Pick<IVM, '_id' | 'node' | 'vmid'>): Promise<void> {
  const vmObjectId = vm._id;
  const { node, vmid } = vm;
  const maxRetries = 12;
  const delayMs = 10_000;
  const initialWaitMs = 15_000;

  // Give the VM time to boot before the first guest-agent query.
  await sleep(initialWaitMs);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await proxmoxClient.get<{ data: { result: ProxmoxNetworkInterface[] } }>(
        `/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`
      );
      const interfaces = res.data.data.result ?? [];

      let foundIp: string | undefined;
      for (const iface of interfaces) {
        if (iface.name === 'lo') continue;
        const match = iface['ip-addresses']?.find(
          (a) => a['ip-address-type'] === 'ipv4' && a['ip-address'].startsWith('10.100.')
        );
        if (match) {
          foundIp = match['ip-address'];
          break;
        }
      }

      if (foundIp) {
        await VM.findByIdAndUpdate(vmObjectId, { ipAddress: foundIp });
        logger.info('VM private IP resolved', {
          vmId: vmObjectId.toString(),
          vmid,
          ipAddress: foundIp,
          attempt,
        });
        // Give cloudbase-init a moment to finish applying the password, then flag
        // the VM as console-ready. The frontend / openConsole gate on this flag.
        await sleep(15_000);
        await VM.findByIdAndUpdate(vmObjectId, { consoleReady: true });
        logger.info('VM console ready', { vmId: vmObjectId.toString(), vmid });
        return;
      }
    } catch (err) {
      // Guest agent not ready yet, VM still booting, transient Proxmox error, etc.
      // Log and fall through to the next retry — never crash.
      logger.warn('IP poll attempt failed — will retry', {
        vmId: vmObjectId.toString(),
        vmid,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (attempt < maxRetries) await sleep(delayMs);
  }

  logger.warn('VM private IP not found after all retries', {
    vmId: vmObjectId.toString(),
    vmid,
    attempts: maxRetries,
  });
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
      data: { cores?: number; memory?: number; scsi0?: string; ostype?: string; description?: string; name?: string; ciuser?: string };
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
      // cloudbase-init can only set the password for the template's existing user.
      // Expose that fixed username; fall back to 'Admin' when the template omits ciuser.
      defaultUsername: cfg.ciuser?.trim() || 'Admin',
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

    // Console protocol is computed server-side from the template OS type — never
    // taken from the client. Windows → rdp, everything else → ssh.
    const consoleProtocol = deriveConsoleProtocol(templateDetails.osType);

    // Console username is fixed by the template (cloudbase-init cannot create users).
    const consoleUsername = templateDetails.defaultUsername;

    // Virtualization (Hyper-V) is Windows-only
    const enableVirtualization = dto.enableVirtualization ?? false;
    if (enableVirtualization && !isWindowsOsType(templateDetails.osType)) {
      throw new ValidationError('Virtualization can only be enabled on Windows templates.');
    }

    // Software installation is Windows-only (Chocolatey)
    const softwareIds = (dto.softwareIds ?? []).map((id) => new mongoose.Types.ObjectId(id));
    if (softwareIds.length > 0 && !isWindowsOsType(templateDetails.osType)) {
      throw new ValidationError('Software installation is only supported on Windows templates.');
    }
    if (softwareIds.length > 0) {
      await softwareService.validateIds(softwareIds);
    }

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
        templateCpuCores: templateSpecs.cpuCores,  // actual template value from Proxmox
        templateMemoryGb: templateSpecs.memoryGb,  // actual template value from Proxmox
        namePrefix: dto.name,
        count: dto.count,
        consoleUsername,
        passwordMode: dto.passwordMode,
        consolePassword: dto.passwordMode === 'fixed' ? dto.consolePassword : undefined,
        consoleProtocol,
        enableVirtualization,
        softwareIds,
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

    // Check live Proxmox power state — source of truth for stop decision.
    // DB status may be stale (e.g. delete_failed, error) while VM is still running in Proxmox.
    let liveProxmoxStatus = 'stopped';
    try {
      const statusRes = await proxmoxClient.get<{ data: { status: string } }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/status/current`
      );
      liveProxmoxStatus = statusRes.data.data.status;
    } catch {
      // If we can't reach Proxmox, assume stopped and let retryProxmoxDelete handle it
      logger.warn('Could not query live VM status before deletion — proceeding', {
        vmId: vmId.toString(), vmid: vm.vmid, node: vm.node,
      });
    }

    // Stop VM first if Proxmox says it's running — regardless of DB status
    if (liveProxmoxStatus === 'running') {
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

    // Mark as deleting — and cancel any in-progress HyperV/software jobs
    // so background provisioners abort on next poll cycle
    vm.status = 'deleting';
    await vm.save();

    await VM.findByIdAndUpdate(vmId, {
      $set: {
        hyperVCancelled: true,
        'softwareInstalls.$[el].cancelled': true,
        'softwareInstalls.$[el].status': 'failed',
        'softwareInstalls.$[el].lastError': 'VM deleted.',
      },
    }, { arrayFilters: [{ 'el.status': { $in: ['pending', 'installing'] } }] });

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
    const pollResult = await pollTask(upid, vm.node);

    if (pollResult === 'failed') {
      throw new VMOperationError('VM failed to start. Check Proxmox task logs.', vm.status, 'stopped');
    }
    if (pollResult === 'unknown') {
      throw new VMOperationError('VM start outcome unknown due to a connectivity issue. Refresh to check actual status.', vm.status, 'stopped');
    }

    vm.status = 'running';
    vm.proxmoxStatus = 'running';
    // Reset until the new boot resolves an IP and cloudbase-init settles. Avoids a
    // stale "ready" flag from a previous start leaving the console enabled too early.
    vm.consoleReady = false;
    await vm.save();

    // Fire-and-forget: resolve the VM's private IP in the background once the
    // guest agent is up. Never awaited — the start response returns immediately.
    void startIpPolling(vm).catch((err: unknown) => {
      logger.error('Unhandled error in IP polling', {
        vmId: vm._id.toString(),
        vmid: vm.vmid,
        error: err instanceof Error ? err.message : String(err),
      });
    });

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
    const pollResult = await pollTask(upid, vm.node);

    if (pollResult === 'failed') {
      throw new VMOperationError('VM failed to stop. Check Proxmox task logs.', vm.status, 'running');
    }
    if (pollResult === 'unknown') {
      throw new VMOperationError('VM stop outcome unknown due to a connectivity issue. Refresh to check actual status.', vm.status, 'running');
    }

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
    const pollResult = await pollTask(upid, vm.node);

    if (pollResult === 'failed') {
      throw new VMOperationError('VM failed to force stop. Check Proxmox task logs.', vm.status, 'running');
    }
    if (pollResult === 'unknown') {
      throw new VMOperationError('VM force stop outcome unknown due to a connectivity issue. Refresh to check actual status.', vm.status, 'running');
    }

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
    const pollResult = await pollTask(upid, vm.node);

    if (pollResult === 'failed') {
      throw new VMOperationError('VM failed to restart. Check Proxmox task logs.', vm.status, 'running');
    }
    if (pollResult === 'unknown') {
      throw new VMOperationError('VM restart outcome unknown due to a connectivity issue. Refresh to check actual status.', vm.status, 'running');
    }

    vm.status = 'running';
    vm.proxmoxStatus = 'running';
    // Disable console during the reboot — the guest agent / IP go away briefly and
    // cloudbase-init re-runs. consoleReady is set back to true by startIpPolling.
    vm.consoleReady = false;
    await vm.save();

    // Fire-and-forget: re-resolve the private IP and re-flag console-ready once the
    // guest agent comes back up after the reboot.
    void startIpPolling(vm).catch((err: unknown) => {
      logger.error('Unhandled error in IP polling', {
        vmId: vm._id.toString(),
        vmid: vm.vmid,
        error: err instanceof Error ? err.message : String(err),
      });
    });

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
    const pollResult = await pollTask(upid, vm.node);

    if (pollResult === 'failed') {
      throw new VMOperationError('VM failed to reset. Check Proxmox task logs.', vm.status, 'running');
    }
    if (pollResult === 'unknown') {
      throw new VMOperationError('VM reset outcome unknown due to a connectivity issue. Refresh to check actual status.', vm.status, 'running');
    }

    vm.status = 'running';
    vm.proxmoxStatus = 'running';
    await vm.save();

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

    // Fire both guest agent calls in parallel — neither depends on the other.
    // Promise.allSettled ensures one failure never blocks the other.
    const [netResult, fsResult] = await Promise.allSettled([
      proxmoxClient.get<{ data: { result: ProxmoxNetworkInterface[] } }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/agent/network-get-interfaces`
      ),
      proxmoxClient.get<{ data: { result: ProxmoxFsInfo[] } }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/agent/get-fsinfo`
      ),
    ]);

    // Resolve IP from guest agent, fall back to stored value
    let ipAddress = vm.ipAddress;
    if (netResult.status === 'fulfilled') {
      const interfaces = netResult.value.data.data.result ?? [];
      for (const iface of interfaces) {
        if (iface.name === 'lo') continue;
        const ipv4 = iface['ip-addresses']?.find(
          (a) => a['ip-address-type'] === 'ipv4' && a['ip-address'].startsWith('10.100.')
        );
        if (ipv4) {
          ipAddress = ipv4['ip-address'];
          if (ipAddress !== vm.ipAddress) {
            await VM.findByIdAndUpdate(vmId, { ipAddress });
          }
          break;
        }
      }
    }

    // Resolve disk usage from guest agent fs-info, fall back to Proxmox status values (0 for KVM)
    let diskUsedGb = bytesToGb(live.disk);
    let diskAllocatedGb = bytesToGb(live.maxdisk);
    if (fsResult.status === 'fulfilled') {
      const filesystems = fsResult.value.data.data.result ?? [];
      // Pick the largest filesystem — primary disk (C:\ on Windows, / on Linux)
      const primary = filesystems
        .filter((fs) => fs['total-bytes'] > 0)
        .sort((a, b) => b['total-bytes'] - a['total-bytes'])[0];
      if (primary) {
        diskUsedGb = bytesToGb(primary['used-bytes']);
        diskAllocatedGb = bytesToGb(primary['total-bytes']);
      }
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
        usedGb: diskUsedGb,
        allocatedGb: diskAllocatedGb,
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
        consoleUsername: vm.consoleUsername,
        consolePassword: vm.consolePassword,
        consoleProtocol: vm.consoleProtocol ?? 'rdp',
        consoleReady: vm.consoleReady ?? false,
        haEnabled: vm.haEnabled,
        enableVirtualization: vm.enableVirtualization ?? false,
        hyperVStatus: vm.hyperVStatus ?? 'disabled',
        hyperVLastError: vm.hyperVLastError || undefined,
        softwareInstalls: (vm.softwareInstalls ?? []).map((s) => ({
          softwareId: s.softwareId.toString(),
          name: s.name,
          status: s.status,
          lastError: s.lastError,
          installedAt: s.installedAt,
        })),
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

  // ─── Virtualization (Hyper-V) ───────────────────────────────────────────────

  /**
   * Get the current virtualization (Hyper-V) status of a VM.
   */
  async getVirtualizationStatus(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VirtualizationStatus> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    return {
      enableVirtualization: vm.enableVirtualization ?? false,
      hyperVStatus: vm.hyperVStatus ?? 'disabled',
      hyperVLastError: vm.hyperVLastError || undefined,
    };
  }

  /**
   * Enable Hyper-V on a VM. Starts the work in the background (it boots the VM,
   * runs PowerShell and reboots — minutes) and returns immediately with
   * 'enabling'. The frontend polls the status until enabled/failed.
   */
  async enableVirtualization(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VirtualizationStatus> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (isHyperVInProgress(vm.hyperVStatus)) {
      throw new VMOperationError('Virtualization change is already in progress.', vm.status, vm.status);
    }

    // Confirm the underlying template/guest is Windows.
    let osType: string | undefined;
    try {
      const cfg = await proxmoxClient.get<{ data: { ostype?: string } }>(
        `/nodes/${vm.node}/qemu/${vm.vmid}/config`
      );
      osType = cfg.data.data.ostype;
    } catch (err) {
      // Best-effort — log and fall through; provisioner will fail clearly if not Windows.
      logger.warn('Could not read VM ostype for virtualization pre-check', {
        vmId: vmId.toString(),
        vmid: vm.vmid,
        node: vm.node,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (osType && !isWindowsOsType(osType)) {
      throw new ValidationError('Virtualization can only be enabled on Windows VMs.');
    }

    await updateHyperVStatus(vmId, 'enabling', {
      lastError: '',
      resetAttempts: true,
      enableVirtualization: true,
    });

    // Reset cancellation flag so a previously cancelled op doesn't block this new one
    await VM.findByIdAndUpdate(vmId, { $set: { hyperVCancelled: false } });

    scheduleHyperVEnable(
      {
        vmObjectId: vm._id,
        node: vm.node,
        vmid: vm.vmid,
        adminId,
        vmName: vm.name,
      },
      true
    );

    return { enableVirtualization: true, hyperVStatus: 'enabling' };
  }

  /**
   * Disable Hyper-V on a VM. Background work, same pattern as enable.
   */
  async disableVirtualization(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VirtualizationStatus> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (isHyperVInProgress(vm.hyperVStatus)) {
      throw new VMOperationError('Virtualization change is already in progress.', vm.status, vm.status);
    }

    // Do NOT set enableVirtualization: false here. The flag reflects actual state,
    // not intent. If the background job fails, Hyper-V is still enabled inside the VM
    // and the flag must stay true. The provisioner sets it false only on confirmed success.
    await updateHyperVStatus(vmId, 'disabling', {
      lastError: '',
      resetAttempts: true,
    });

    // Reset cancellation flag so a previously cancelled op doesn't block this new one
    await VM.findByIdAndUpdate(vmId, { $set: { hyperVCancelled: false } });

    scheduleHyperVDisable({
      vmObjectId: vm._id,
      node: vm.node,
      vmid: vm.vmid,
      adminId,
      vmName: vm.name,
    }, true);

    return { enableVirtualization: vm.enableVirtualization ?? false, hyperVStatus: 'disabling' };
  }

  /**
   * Cancel an in-progress HyperV operation.
   * Sets the cancellation flag — the provisioner detects it on next poll and aborts.
   */
  async cancelVirtualization(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<VirtualizationStatus> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    if (!isHyperVInProgress(vm.hyperVStatus)) {
      throw new VMOperationError('No virtualization operation is in progress.', vm.status, vm.status);
    }

    await VM.findByIdAndUpdate(vmId, {
      $set: {
        hyperVCancelled: true,
        hyperVLastError: 'Cancelled by admin.',
        hyperVStatus: 'failed',
        hyperVStatusChangedAt: new Date(),
      },
    });

    logger.info('HyperV operation cancelled', { vmId: vmId.toString(), vmid: vm.vmid });
    return { enableVirtualization: vm.enableVirtualization ?? false, hyperVStatus: 'failed', hyperVLastError: 'Cancelled by admin.' };
  }

  /**
   * Cancel all pending/installing software installs on a VM.
   */
  async cancelSoftwareInstalls(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request
  ): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    await VM.updateOne(
      { _id: vmId },
      {
        $set: {
          'softwareInstalls.$[el].cancelled': true,
          'softwareInstalls.$[el].status': 'failed',
          'softwareInstalls.$[el].lastError': 'Cancelled by admin.',
        },
      },
      { arrayFilters: [{ 'el.status': { $in: ['pending', 'installing'] } }] }
    );

    logger.info('Software installs cancelled', { vmId: vmId.toString(), vmid: vm.vmid });
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
  ): Promise<{ job: IVMJob; vms: JobVMCredential[] }> {
    const authReq = req as AuthenticatedRequest;

    const job = await VMJob.findById(jobId);
    if (!job) throw new VMNotFoundError(`Job ${jobId.toString()} not found.`);

    if (authReq.user.role !== 'super_admin' && job.adminId.toString() !== adminId.toString()) {
      throw new VMOwnershipError('You do not have permission to access this job.');
    }

    // Include the created VMs' console credentials so the job page can show them
    // once after creation (per-VM passwords in dynamic mode live on each VM doc).
    const vmDocs = job.vmIds.length
      ? await VM.find({ _id: { $in: job.vmIds } })
          .select('name status ipAddress consoleUsername consolePassword consoleProtocol')
          .lean()
      : [];

    const vms: JobVMCredential[] = vmDocs.map((v) => ({
      id: v._id.toString(),
      name: v.name,
      status: v.status,
      ipAddress: v.ipAddress,
      consoleUsername: v.consoleUsername,
      consolePassword: v.consolePassword,
      consoleProtocol: v.consoleProtocol ?? 'rdp',
    }));

    return { job, vms };
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

  // ─── VM Assignment ──────────────────────────────────────────────────────────

  /**
   * Get assigned VM counts for all users managed by this admin — single aggregation query.
   * Returns a map of userId → count.
   */
  async getAssignedVMCounts(adminId: mongoose.Types.ObjectId): Promise<Record<string, number>> {
    const results = await VM.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { adminId, assignedTo: { $ne: null } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]);

    const map: Record<string, number> = {};
    for (const r of results) {
      map[r._id.toString()] = r.count;
    }
    return map;
  }

  /**
   * Get all VMs owned by this admin that are not yet assigned to any user.
   */
  async getAvailableVMs(adminId: mongoose.Types.ObjectId): Promise<mongoose.FlattenMaps<IVM>[]> {
    return VM.find({
      adminId,
      assignedTo: null,
      status: { $nin: ['deleted', 'deleting', 'delete_failed', 'creating'] },
    }).lean();
  }

  /**
   * Get all VMs assigned to a specific user, scoped to this admin's VMs.
   * Admin can only see assignments for users they created.
   */
  async getAssignedVMsForUser(
    targetUserId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<mongoose.FlattenMaps<IVM>[]> {
    // Verify the target user belongs to this admin
    const user = await User.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');
    if (!user.createdBy || user.createdBy.toString() !== adminId.toString()) {
      throw new ForbiddenError('You can only manage users you created.');
    }

    return VM.find({ adminId, assignedTo: targetUserId }).lean();
  }

  /**
   * Assign multiple VMs to a user.
   * - All VMs must be owned by this admin
   * - All VMs must be currently unassigned
   * - Target user must be created by this admin
   */
  async assignVMs(
    vmIds: mongoose.Types.ObjectId[],
    targetUserId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<{ assigned: number }> {
    if (vmIds.length === 0) throw new ValidationError('No VMs specified.');
    if (vmIds.length > 50) throw new ValidationError('Cannot assign more than 50 VMs at once.');

    // Verify target user belongs to this admin
    const user = await User.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');
    if (!user.createdBy || user.createdBy.toString() !== adminId.toString()) {
      throw new ForbiddenError('You can only assign VMs to users you created.');
    }

    // Fetch all requested VMs in one query
    const vms = await VM.find({ _id: { $in: vmIds }, adminId });

    if (vms.length !== vmIds.length) {
      throw new ForbiddenError('One or more VMs not found or do not belong to you.');
    }

    // Check none are already assigned
    const alreadyAssigned = vms.filter((vm) => vm.assignedTo != null);
    if (alreadyAssigned.length > 0) {
      const names = alreadyAssigned.map((v) => v.name).join(', ');
      throw new ValidationError(`The following VMs are already assigned: ${names}`);
    }

    await VM.updateMany(
      { _id: { $in: vmIds }, adminId, assignedTo: null },
      { $set: { assignedTo: targetUserId } }
    );

    logger.info('VMs assigned to user', {
      adminId: adminId.toString(),
      targetUserId: targetUserId.toString(),
      vmIds: vmIds.map((id) => id.toString()),
    });

    return { assigned: vmIds.length };
  }

  /**
   * Unassign a VM from its current user.
   * Admin must own the VM.
   */
  async unassignVM(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError();
    if (vm.adminId.toString() !== adminId.toString()) throw new VMOwnershipError();
    if (!vm.assignedTo) throw new ValidationError('VM is not currently assigned.');

    vm.assignedTo = undefined;
    await vm.save();

    logger.info('VM unassigned', {
      adminId: adminId.toString(),
      vmId: vmId.toString(),
    });
  }

  /**
   * Get all VMs assigned to the calling user (for user dashboard).
   */
  async getMyAssignedVMs(userId: mongoose.Types.ObjectId): Promise<mongoose.FlattenMaps<IVM>[]> {
    return VM.find({ assignedTo: userId }).lean();
  }

  /**
   * Open a browser-based console session for a VM via Guacamole.
   *
   * Looks up the VM, verifies ownership, resolves connection params, then asks
   * guacamoleClient to upsert a Guacamole connection and mint a browser URL.
   *
   * NOTE (Phase 4 scaffolding):
   * The VM model does not yet store private IP / RDP / SSH credentials.
   * For initial testing we fall back to TEST_VM_IP / TEST_VM_USERNAME /
   * TEST_VM_PASSWORD from env. Once vm.privateIp + encrypted credential
   * fields land, this resolver should pull from the VM document.
   */
  async openConsole(
    vmId: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    req: Request,
    protocolOverride?: GuacamoleProtocol
  ): Promise<{ protocol: GuacamoleProtocol; clientUrl: string; connectionId: string }> {
    const authReq = req as AuthenticatedRequest;

    const vm = await VM.findById(vmId);
    if (!vm) throw new VMNotFoundError(`VM ${vmId.toString()} not found.`);
    assertOwnership(vm, adminId.toString(), authReq.user.role);

    // Server-side state check — frontend already disables the button when
    // not running, but the API must enforce this too.
    if (vm.status !== 'running') {
      throw new VMOperationError(
        'VM must be running to open a console session.',
        vm.status,
        'running'
      );
    }

    if (!vm.consoleReady) {
      throw new ValidationError(
        'VM console is not ready yet. Please wait 1-2 minutes after starting the VM and try again.'
      );
    }

    // Resolve connection params from the VM document, falling back to the
    // TEST_VM_* env scaffolding only when a field is empty (eases transition for
    // the legacy test VM). Query override still wins for protocol.
    const hostname = vm.ipAddress ?? process.env['TEST_VM_IP'];
    const username = vm.consoleUsername ?? process.env['TEST_VM_USERNAME'];
    const password = vm.consolePassword ?? process.env['TEST_VM_PASSWORD'];
    const protocol: GuacamoleProtocol = protocolOverride ?? vm.consoleProtocol ?? 'rdp';

    if (!hostname) {
      throw new ValidationError(
        'VM IP address is not available yet. The VM may still be booting. Please wait 30-60 seconds and try again.'
      );
    }

    if (!username || !password) {
      throw new ValidationError('VM console credentials are not available.');
    }

    const port = protocol === 'rdp' ? 3389 : protocol === 'ssh' ? 22 : 5900;

    logger.info('VM console session requested', {
      userId: authReq.user.userId,
      vmId: vmId.toString(),
      vmName: vm.name,
      protocol,
    });

    const session = await guacamoleClient.openConsole(
      `vm-${vmId.toString()}`,
      protocol,
      {
        hostname,
        port,
        username,
        password,
        ignoreCert: true,
        securityMode: 'any',
      }
    );

    // Audit trail — written *after* the session is successfully minted.
    // Same pattern as VM_STARTED / VM_STOPPED in the power-op handlers.
    // NEVER persist VM credentials, Guacamole tokens, or the clientUrl here.
    await VMEvent.create({
      vmId: vm._id,
      vmid: vm.vmid,
      adminId,
      event: 'VM_CONSOLE_OPENED',
      status: 'success',
      details: {
        protocol: session.protocol,
        connectionId: session.connectionId,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return {
      protocol: session.protocol,
      clientUrl: session.clientUrl,
      connectionId: session.connectionId,
    };
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
