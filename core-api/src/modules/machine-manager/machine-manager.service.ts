import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MachineModel, JobModel, type IMachine, type IJob } from './machine-manager.model';
import { SoftwareCatalogModel } from '../software-catalog/software-catalog.model';
import { softwareCatalogService } from '../software-catalog/software-catalog.service';
import type { SoftwareCatalogResponse } from '../software-catalog/software-catalog.types';
import type {
  CreateMachineDto,
  MachineResponse,
  JobResponse,
  CreateJobDto,
  AgentRegisterDto,
  AgentJobResultDto,
  AgentHeartbeatDto,
} from './machine-manager.types';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { emitJobStatusEvent } from './job.events';
import { PushSessionModel } from '../../models/pushSession.model';

// ─── Push session registry ────────────────────────────────────────────────────
// Maps sessionId → { machineIds, adminId } so heartbeat/WS can emit agent_connected
interface PushSessionEntry {
  machineIds: Set<string>;
  adminId: string;
}
const pushSessionRegistry = new Map<string, PushSessionEntry>();

// Clean up sessions older than 10 minutes
setInterval(() => {
  // Registry entries are removed when the SSE stream closes (via cleanup in controller)
  // This is a safety net for any that were never cleaned up
}, 10 * 60 * 1000);

class MachineManagerService {
  // ─── Mappers ───────────────────────────────────────────────────────────────

  private toMachineResponse(doc: IMachine): MachineResponse {
    return {
      _id: doc._id.toString(),
      name: doc.name,
      ipAddress: doc.ipAddress,
      os: doc.os,
      agentId: doc.agentId,
      accountToken: doc.accountToken,
      status: doc.status,
      adminId: doc.adminId.toString(),
      lastSeen: doc.lastSeen?.toISOString(),
      specs: doc.specs ? {
        hostname:  doc.specs.hostname,
        osVersion: doc.specs.osVersion,
        cpuCores:  doc.specs.cpuCores,
        ramGb:     doc.specs.ramGb,
        diskGb:    doc.specs.diskGb,
      } : undefined,
      trackingEnabled: doc.trackingEnabled ?? false,
      trackingEnabledAt: doc.trackingEnabledAt?.toISOString(),
      agentVersion: doc.agentVersion,
      rackoAppVersion: doc.rackoAppVersion,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private toJobResponse(doc: IJob, softwareName = ''): JobResponse {
    return {
      _id: doc._id.toString(),
      machineId: doc.machineId.toString(),
      softwareIds: doc.softwareIds.map((id) => id.toString()),
      softwareName,
      status: doc.status,
      logs: doc.logs,
      attempts: doc.attempts,
      adminId: doc.adminId.toString(),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  // ─── Machines ──────────────────────────────────────────────────────────────

  async addMachine(dto: CreateMachineDto, adminId: mongoose.Types.ObjectId): Promise<MachineResponse> {
    const accountToken = uuidv4();
    const doc = await MachineModel.create({
      name: dto.name,
      ipAddress: dto.ipAddress,
      os: dto.os,
      accountToken,
      adminId,
    });

    logger.info('[MachineManager] Added machine', {
      machineId: doc._id.toString(),
      adminId: adminId.toString(),
    });

    return this.toMachineResponse(doc);
  }

  async bulkAddMachines(
    dtos: CreateMachineDto[],
    adminId: mongoose.Types.ObjectId
  ): Promise<MachineResponse[]> {
    const results: MachineResponse[] = [];
    for (const dto of dtos) {
      const m = await this.addMachine(dto, adminId);
      results.push(m);
    }
    return results;
  }

  async listMachines(adminId: mongoose.Types.ObjectId): Promise<MachineResponse[]> {
    const docs = await MachineModel.find({ adminId, deleted: { $ne: true } }).sort({ createdAt: -1 });
    return docs.map((d) => this.toMachineResponse(d));
  }

  async getMachine(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<MachineResponse> {
    const doc = await this.findOwnedMachine(id, adminId);
    return this.toMachineResponse(doc);
  }

  async bulkDeleteMachines(
    machineIds: string[],
    adminId: mongoose.Types.ObjectId
  ): Promise<{ deleted: string[]; failed: { machineId: string; error: string }[] }> {
    const deleted: string[] = [];
    const failed: { machineId: string; error: string }[] = [];

    await Promise.all(
      machineIds.map(async (machineId) => {
        try {
          const id = new mongoose.Types.ObjectId(machineId);
          await this.deleteMachine(id, adminId);
          deleted.push(machineId);
        } catch (err) {
          failed.push({
            machineId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
          logger.warn('[MachineManager] Bulk delete — single machine failed', {
            machineId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    logger.info('[MachineManager] Bulk delete completed', {
      requested: machineIds.length,
      deleted: deleted.length,
      failed: failed.length,
      adminId: adminId.toString(),
    });

    return { deleted, failed };
  }

  async deleteMachine(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwnedMachine(id, adminId);

    // Send uninstall command via WebSocket — agent runs cleanup script immediately.
    // If agent is offline the 403 fallback on next heartbeat will handle it.
    const { wsManager } = await import('./websocket/wsManager');
    if (doc.agentId) {
      const delivered = wsManager.sendUninstall(doc.agentId);
      logger.info('[MachineManager] Uninstall command sent via WebSocket', {
        machineId: id.toString(),
        agentId: doc.agentId,
        delivered,
      });
    }

    // Soft delete — agent gets 403 on next heartbeat as a fallback if WS delivery failed
    doc.deleted = true;
    doc.status = 'offline';
    await doc.save();

    logger.info('[MachineManager] Soft deleted machine', {
      machineId: id.toString(),
      adminId: adminId.toString(),
    });

    // Close the WebSocket connection so agent reconnects and immediately gets 403
    if (doc.agentId) {
      wsManager.closeConnection(doc.agentId, 4010, 'Machine deleted');
    }

    // Clean up all related data so nothing orphans in the database
    await JobModel.deleteMany({ machineId: id });

    const { MachineActivityModel } = await import('../../models/machineActivity.model');
    await MachineActivityModel.deleteMany({ machineId: id });

    const { MachineBaselineModel } = await import('../../models/machineBaseline.model');
    await MachineBaselineModel.deleteMany({ machineId: id });

    logger.info('[MachineManager] Cleaned up related data for deleted machine', {
      machineId: id.toString(),
    });
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  /** Create one job per machine per software item. */
  async createJobs(
    dto: CreateJobDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<JobResponse[]> {
    // Verify all machines are owned by this admin
    for (const machineId of dto.machineIds) {
      const id = new mongoose.Types.ObjectId(machineId);
      await this.findOwnedMachine(id, adminId);
    }

    // Verify all software items exist
    const softwareObjectIds = dto.softwareIds.map((id) => new mongoose.Types.ObjectId(id));
    const softwareCount = await SoftwareCatalogModel.countDocuments({
      _id: { $in: softwareObjectIds },
    });
    if (softwareCount !== dto.softwareIds.length) {
      throw new ValidationError('One or more software items were not found.');
    }

    const jobs: JobResponse[] = [];

    for (const machineId of dto.machineIds) {
      const machine = await MachineModel.findById(machineId);

      // One job per software item — enables per-software status tracking
      for (const softwareId of softwareObjectIds) {
        // Deduplication: return existing job if one is already pending or installing
        const existing = await JobModel.findOne({
          machineId: new mongoose.Types.ObjectId(machineId),
          softwareIds: [softwareId],
          status: { $in: ['pending', 'installing'] },
        });

        if (existing) {
          logger.info('[MachineManager] Duplicate job prevented — returning existing job', {
            jobId: existing._id.toString(),
            machineId,
            softwareId: softwareId.toString(),
          });
          jobs.push(this.toJobResponse(existing));
          continue;
        }

        const doc = await JobModel.create({
          machineId: new mongoose.Types.ObjectId(machineId),
          softwareIds: [softwareId],
          adminId,
        });

        logger.info('[MachineManager] Created install job', {
          jobId: doc._id.toString(),
          machineId,
          softwareId: softwareId.toString(),
          adminId: adminId.toString(),
        });

        jobs.push(this.toJobResponse(doc));

        // Push job to agent if connected via WebSocket
        if (machine?.agentId) {
          const { wsManager } = await import('./websocket/wsManager');
          const pushed = wsManager.pushJob(machine.agentId, {
            _id: doc._id.toString(),
            machineId: doc.machineId.toString(),
            softwareIds: doc.softwareIds.map((id) => id.toString()),
            status: doc.status,
            logs: doc.logs,
            attempts: doc.attempts,
          });
          if (pushed) {
            logger.info('[MachineManager] Job pushed via WebSocket', {
              jobId: doc._id.toString(),
              agentId: machine.agentId,
            });
          } else {
            logger.warn('[MachineManager] Job NOT pushed - agent not connected via WebSocket', {
              jobId: doc._id.toString(),
              agentId: machine.agentId,
              machineId: machineId.toString(),
            });
          }
        } else {
          logger.warn('[MachineManager] Job NOT pushed - machine has no agentId', {
            jobId: doc._id.toString(),
            machineId: machineId.toString(),
          });
        }
      }
    }

    return jobs;
  }

  async listJobs(adminId: mongoose.Types.ObjectId): Promise<JobResponse[]> {
    const docs = await JobModel.find({ adminId }).sort({ createdAt: -1 })
      .populate<{ softwareIds: Array<{ _id: mongoose.Types.ObjectId; name: string }> }>('softwareIds', 'name');
    return docs.map((d) => {
      const swName = (d.softwareIds[0] as unknown as { name?: string } | undefined)?.name ?? '';
      return this.toJobResponse(d as unknown as IJob, swName);
    });
  }

  async getJob(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<JobResponse> {
    const doc = await JobModel.findById(id)
      .populate<{ softwareIds: Array<{ _id: mongoose.Types.ObjectId; name: string }> }>('softwareIds', 'name');
    if (!doc) throw new NotFoundError('Job not found.');
    if (doc.adminId.toString() !== adminId.toString()) {
      throw new ForbiddenError('You do not have permission to access this job.');
    }
    const swName = (doc.softwareIds[0] as unknown as { name?: string } | undefined)?.name ?? '';
    return this.toJobResponse(doc as unknown as IJob, swName);
  }

  // ─── Agent endpoints (no auth — token-based) ──────────────────────────────

  async registerAgent(dto: AgentRegisterDto): Promise<{ agentId: string }> {
    const machine = await MachineModel.findOne({ accountToken: dto.accountToken });
    if (!machine) {
      throw new NotFoundError('Invalid account token.');
    }

    const agentId = uuidv4();
    machine.agentId = agentId;
    machine.status = 'online';
    machine.lastSeen = new Date();
    await machine.save();

    logger.info('[MachineManager] Agent registered', {
      machineId: machine._id.toString(),
      agentId,
      hostname: dto.hostname,
      os: dto.os,
    });

    return { agentId };
  }

  /**
   * Enrollment flow (VM Template path).
   * Agent has enrollmentKey baked in — no accountToken.
   * Platform looks up the admin by enrollmentKey, auto-creates a Machine record,
   * returns a unique accountToken for this machine going forward.
   */
  async enrollAgent(dto: import('./machine-manager.types').AgentEnrollDto): Promise<{ agentId: string; accountToken: string }> {
    const { User } = await import('../../models/user.model');
    const admin = await User.findOne({ enrollmentKey: dto.enrollmentKey });
    if (!admin) {
      throw new NotFoundError('Invalid enrollment key.');
    }

    // Prevent duplicate enrollments from same machine fingerprint
    const existing = await MachineModel.findOne({
      adminId: admin._id,
      $or: [
        { ipAddress: dto.mac }, // mac stored as ipAddress for template machines
      ],
    });

    const accountToken = uuidv4();
    const agentId = uuidv4();

    if (existing && existing.agentId) {
      // Machine re-enrolled (e.g. VM restarted) — refresh its token and agentId
      existing.agentId = agentId;
      existing.accountToken = accountToken;
      existing.status = 'online';
      existing.lastSeen = new Date();
      await existing.save();

      logger.info('[MachineManager] Agent re-enrolled', {
        machineId: existing._id.toString(),
        agentId,
        hostname: dto.hostname,
      });

      return { agentId, accountToken };
    }

    // New machine — auto-create record under the admin
    const osMap: Record<string, import('./machine-manager.model').MachineOS> = {
      windows: 'windows',
      linux: 'linux',
      darwin: 'macos',
    };
    const os = osMap[dto.os.toLowerCase()] ?? 'linux';

    const doc = await MachineModel.create({
      name: dto.hostname,
      ipAddress: dto.mac, // best available unique identifier at enroll time
      os,
      agentId,
      accountToken,
      status: 'online',
      adminId: admin._id,
      lastSeen: new Date(),
    });

    logger.info('[MachineManager] Agent enrolled via enrollmentKey', {
      machineId: doc._id.toString(),
      agentId,
      hostname: dto.hostname,
      adminId: admin._id.toString(),
    });

    return { agentId, accountToken };
  }

  /** Returns the oldest pending job for this agent's machine, or null. */
  async getPendingJobForAgent(agentId: string): Promise<JobResponse | null> {
    const machine = await MachineModel.findOne({ agentId });
    if (!machine) {
      logger.warn('[Agent] getPendingJobForAgent — agent not found', { agentId });
      throw new NotFoundError('Agent not found.');
    }

    const job = await JobModel.findOne({
      machineId: machine._id,
      status: 'pending',
    }).sort({ createdAt: 1 });

    logger.debug('[Agent] getPendingJobForAgent result', {
      agentId,
      machineId: machine._id.toString(),
      machineName: machine.name,
      jobFound: !!job,
      jobId: job?._id.toString(),
    });

    return job ? this.toJobResponse(job) : null;
  }

  async updateJobResult(jobId: mongoose.Types.ObjectId, dto: AgentJobResultDto): Promise<void> {
    logger.info('[MachineManager] updateJobResult start', { jobId: jobId.toString(), status: dto.status, agentId: dto.agentId });
    const job = await JobModel.findById(jobId);
    if (!job) throw new NotFoundError('Job not found.');

    // Verify the agent reporting actually owns this machine
    const machine = await MachineModel.findOne({ agentId: dto.agentId });
    if (!machine || machine._id.toString() !== job.machineId.toString()) {
      throw new ForbiddenError('Agent is not authorized to update this job.');
    }

    job.status = dto.status;
    job.logs = dto.logs;
    job.attempts = (job.attempts ?? 0) + 1;
    await job.save();

    logger.info('[MachineManager] Job result updated', {
      jobId: jobId.toString(),
      status: dto.status,
      agentId: dto.agentId,
      attempts: job.attempts,
      logsLength: dto.logs?.length ?? 0,
    });

    // Emit SSE event so browser gets real-time update
    emitJobStatusEvent(jobId.toString(), {
      jobId: jobId.toString(),
      status: dto.status,
      logs: dto.logs,
      attempts: job.attempts,
      softwareId: job.softwareIds[0]?.toString() ?? '',
    });
  }

  async handleHeartbeat(dto: AgentHeartbeatDto): Promise<import('./machine-manager.types').HeartbeatUpdateInfo | null> {
    const machine = await MachineModel.findOne({ agentId: dto.agentId });
    if (!machine) throw new NotFoundError('Agent not found.');

    if (machine.deleted) {
      throw new ForbiddenError('Agent has been deleted.');
    }

    const wasOffline = machine.status !== 'online';
    machine.status = dto.status === 'online' ? 'online' : 'offline';
    machine.lastSeen = new Date();
    if (dto.specs) {
      machine.specs = {
        hostname:  dto.specs.hostname,
        osVersion: dto.specs.osVersion,
        cpuCores:  dto.specs.cpuCores,
        ramGb:     dto.specs.ramGb,
        diskGb:    dto.specs.diskGb,
      };
    }
    // Store reported versions so admins can see what each machine runs
    if (dto.version) {
      machine.agentVersion = dto.version;
    }
    if (dto.rackoAppVersion !== undefined) {
      machine.rackoAppVersion = dto.rackoAppVersion;
    }
    await machine.save();

    // Emit agent_connected SSE event if this machine is part of an active push session
    if (wasOffline) {
      const machineIdStr = machine._id.toString();
      for (const [sessionId, entry] of pushSessionRegistry) {
        if (entry.machineIds.has(machineIdStr)) {
          const { emitPushEvent } = await import('./push.events');
          emitPushEvent(sessionId, {
            type: 'agent_connected',
            machineId: machineIdStr,
            machineName: machine.name,
          });
          break;
        }
      }
    }

    const { config } = await import('../../config');

    const response: import('./machine-manager.types').HeartbeatUpdateInfo = {
      updateAvailable: false,
      latestVersion: '',
      checksum: '',
      trackingEnabled: machine.trackingEnabled ?? false,
      rackoAppUpdateAvailable: false,
      rackoAppLatestVersion: '',
      rackoAppChecksum: '',
    };

    // ── Agent auto-update ─────────────────────────────────────────────────────
    const publishedAgentVersion = config.AGENT_VERSION;
    if (publishedAgentVersion && dto.version && isVersionOutdated(dto.version, publishedAgentVersion)) {
      logger.info('[MachineManager] Agent outdated — sending update signal', {
        agentId: dto.agentId,
        currentVersion: dto.version,
        latestVersion: publishedAgentVersion,
      });

      let checksum = '';
      const os = machine.os?.toLowerCase() ?? '';
      if (os === 'windows') checksum = (config.AGENT_CHECKSUM_WINDOWS ?? '').trim();
      else if (os === 'linux') checksum = (config.AGENT_CHECKSUM_LINUX ?? '').trim();
      else if (os === 'macos') checksum = (config.AGENT_CHECKSUM_DARWIN ?? '').trim();

      response.updateAvailable = true;
      response.latestVersion = publishedAgentVersion;
      response.checksum = checksum;
    }

    // ── Racko App auto-update (Windows only, app must already be installed) ───
    const publishedAppVersion = config.RACKO_APP_VERSION;
    if (
      machine.os === 'windows' &&
      publishedAppVersion &&
      dto.rackoAppVersion &&
      isVersionOutdated(dto.rackoAppVersion, publishedAppVersion)
    ) {
      logger.info('[MachineManager] Racko App outdated — sending update signal', {
        agentId: dto.agentId,
        currentVersion: dto.rackoAppVersion,
        latestVersion: publishedAppVersion,
      });

      response.rackoAppUpdateAvailable = true;
      response.rackoAppLatestVersion = publishedAppVersion;
      response.rackoAppChecksum = (config.RACKO_APP_CHECKSUM ?? '').trim();
    }

    return response;
  }

  /**
   * Enable or disable tracking for one or more machines.
   * Sends a real-time tracking_update WS command to any connected agents.
   * Idempotent — safe to call multiple times with the same value.
   */
  async setTracking(
    machineIds: string[],
    enabled: boolean,
    adminId: mongoose.Types.ObjectId
  ): Promise<MachineResponse[]> {
    const { wsManager } = await import('./websocket/wsManager');
    const updated: MachineResponse[] = [];

    for (const machineId of machineIds) {
      const id = new mongoose.Types.ObjectId(machineId);
      const doc = await this.findOwnedMachine(id, adminId);

      const now = new Date();
      doc.trackingEnabled = enabled;
      if (enabled) {
        doc.trackingEnabledAt = now;
        doc.trackingEnabledBy = adminId;
      }
      await doc.save();

      logger.info('[MachineManager] Tracking updated', {
        machineId,
        enabled,
        adminId: adminId.toString(),
      });

      // Send real-time command to agent if connected — no need to wait for next heartbeat
      if (doc.agentId && wsManager.isConnected(doc.agentId)) {
        wsManager.sendTrackingUpdate(doc.agentId, enabled);
      }

      updated.push(this.toMachineResponse(doc));
    }

    return updated;
  }

  /**
   * Agent fetches full software record so it knows the install method,
   * package name, fileUrl etc. Validates the agentId belongs to a real machine.
   */
  async getSoftwareForAgent(
    softwareId: mongoose.Types.ObjectId,
    agentId: string
  ): Promise<SoftwareCatalogResponse> {
    const machine = await MachineModel.findOne({ agentId });
    if (!machine) throw new NotFoundError('Agent not found.');
    return softwareCatalogService.getById(softwareId);
  }

  /**
   * Issues a short-lived signed download token for a machine's agent binary.
   * The token is stored in memory with a 60-second TTL and is single-use.
   * Frontend calls this (with JWT auth), gets the token, constructs a plain URL.
   */
  async issueDownloadToken(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    os: string
  ): Promise<{ downloadToken: string; expiresInSeconds: number }> {
    await this.findOwnedMachine(id, adminId); // ownership check
    const { createDownloadToken } = await import('../../utils/downloadTokenStore');
    const token = createDownloadToken(id.toString(), adminId.toString(), os);
    return { downloadToken: token, expiresInSeconds: 60 };
  }

  /**
   * Redeems a single-use download token and returns the agent build info.
   * Called by the public (no-auth) download endpoint.
   */
  async redeemDownloadToken(
    downloadToken: string
  ): Promise<{ accountToken: string; platformUrl: string; os: string }> {
    const { consumeDownloadToken } = await import('../../utils/downloadTokenStore');
    const entry = consumeDownloadToken(downloadToken);
    if (!entry) throw new NotFoundError('Download token is invalid or has expired.');

    const doc = await MachineModel.findById(entry.machineId);
    if (!doc) throw new NotFoundError('Machine not found.');

    const { config } = await import('../../config');
    return {
      accountToken: doc.accountToken,
      platformUrl: config.FRONTEND_URL ?? '',
      os: entry.os,
    };
  }

  /**
   * Returns the accountToken and platformUrl needed for the frontend to
   * construct a pre-configured agent download URL.
   */
  async getAgentDownloadInfo(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<{ accountToken: string; platformUrl: string }> {
    const doc = await this.findOwnedMachine(id, adminId);
    const { config } = await import('../../config');
    return {
      accountToken: doc.accountToken,
      platformUrl: config.FRONTEND_URL ?? '',
    };
  }

  /**
   * VM push flow — creates machine records then triggers SSH/WinRM agent push.
   * All pushes run in parallel so 30 VMs take the same time as 1 VM (~30-60s)
   * instead of sequentially (30 × 30-60s = 15-30 minutes).
   * Credentials are passed through to vm-push.service and never persisted.
   * sessionId is used to emit SSE events per-VM as each push completes.
   */
  async pushAgentToVMs(
    vms: Array<{ name: string; ipAddress: string; os: import('./machine-manager.model').MachineOS; username: string; password: string }>,
    adminId: mongoose.Types.ObjectId,
    sessionId: string,
    groupId?: string,
  ): Promise<{ machines: MachineResponse[]; pushResults: import('./vm-push.service').VMPushResult[] }> {
    const { vmPushService } = await import('./vm-push.service');
    const { emitPushEvent } = await import('./push.events');

    // Step 1: Create all machine records synchronously (fast, DB only)
    const machines: MachineResponse[] = [];
    for (const vm of vms) {
      const machine = await this.addMachine(
        { name: vm.name, ipAddress: vm.ipAddress, os: vm.os },
        adminId
      );
      machines.push(machine);
    }

    // Step 2: If a groupId was provided, add the new machines to the group
    if (groupId) {
      try {
        const gid = new mongoose.Types.ObjectId(groupId);
        const { MachineGroupModel } = await import('../../models/machineGroup.model');
        const group = await MachineGroupModel.findOne({ _id: gid, adminId });
        if (group) {
          const newIds = machines.map((m) => new mongoose.Types.ObjectId(m._id));
          const existingSet = new Set(group.machineIds.map((id) => id.toString()));
          for (const oid of newIds) {
            if (!existingSet.has(oid.toString())) group.machineIds.push(oid);
          }
          await group.save();
          // Set groupId on the machine records
          await MachineModel.updateMany(
            { _id: { $in: newIds } },
            { groupId: gid },
          );
          logger.info('[MachineManager] Pushed machines added to group', { groupId, count: machines.length });
        }
      } catch (err) {
        logger.warn('[MachineManager] Failed to assign group to pushed machines (non-fatal)', { err });
      }
    }

    // Register this session so agent heartbeat/WS can emit agent_connected events
    pushSessionRegistry.set(sessionId, {
      machineIds: new Set(machines.map((m) => m._id)),
      adminId: adminId.toString(),
    });

    // Persist session to MongoDB so the browser can recover state on page refresh.
    // Fire-and-forget — never blocks the push flow.
    void PushSessionModel.create({
      sessionId,
      adminId: adminId.toString(),
      machines: machines.map((m, i) => ({
        machineId:   m._id,
        machineName: m.name,
        ipAddress:   vms[i].ipAddress,
        agentConnected: false,
      })),
    }).catch((err) => {
      logger.warn('[MachineManager] Failed to persist push session to DB (non-fatal)', { sessionId, err });
    });

    // Fire WinRM/SSH pushes in the background — do NOT await.
    // The HTTP response is returned immediately after machine records are created.
    // Push results are delivered to the frontend via the SSE stream as each push completes.
    // This prevents gateway timeouts on large batches (30s WinRM timeout × N machines).
    void (async () => {
      let completedCount = 0;
      const totalCount = machines.length;
      await Promise.all(
        machines.map((machine, i) =>
          vmPushService.pushAgent({
            machineId: machine._id,
            ipAddress: vms[i].ipAddress,
            os: vms[i].os,
            username: vms[i].username,
            password: vms[i].password,
            accountToken: machine.accountToken,
          }).then((result) => {
            emitPushEvent(sessionId, {
              type: 'push_result',
              machineId: machine._id,
              success: result.success,
              error: result.error,
            });
            // Persist push_result for page-refresh recovery
            void PushSessionModel.updateOne(
              { sessionId, 'machines.machineId': machine._id },
              { $set: { 'machines.$.pushSuccess': result.success, 'machines.$.pushError': result.error ?? null } }
            ).catch(() => { /* non-fatal */ });
            completedCount++;
            if (completedCount === totalCount) {
              logger.info('[MachineManager] All push attempts completed', { sessionId, total: totalCount });
            }
            return result;
          })
        )
      );
    })();

    return { machines, pushResults: [] };
  }

  removePushSession(sessionId: string): void {
    pushSessionRegistry.delete(sessionId);
    logger.info('[MachineManager] Push session removed', { sessionId });
  }

  /**
   * Called by wsManager when an agent connects via WebSocket.
   * Looks up any active push session containing this machineId and emits agent_connected.
   * If found, also triggers racko-app installation via exec over the existing WS —
   * this avoids WinRM timeout issues for large downloads (racko-app.zip is ~72MB).
   */
  async notifyAgentConnected(machineId: string, machineName: string): Promise<void> {
    for (const [sessionId, entry] of pushSessionRegistry) {
      if (entry.machineIds.has(machineId)) {
        const { emitPushEvent } = await import('./push.events');
        emitPushEvent(sessionId, {
          type: 'agent_connected',
          machineId,
          machineName,
        });
        logger.info('[MachineManager] agent_connected emitted via WS connection', { sessionId, machineId });
        // Persist agent_connected for page-refresh recovery
        void PushSessionModel.updateOne(
          { sessionId, 'machines.machineId': machineId },
          { $set: { 'machines.$.agentConnected': true } }
        ).catch(() => { /* non-fatal */ });

        // ── Install racko-app via exec over WebSocket ──────────────────────────
        // WinRM only handles the fast part (agent install). Once the agent is
        // connected, we use the persistent WS channel to run the GUI setup —
        // no WinRM session, no timeout pressure, runs as SYSTEM on the VM.
        // Fire-and-forget: we don't await so the WS connect handler returns immediately.
        void this.installRackoAppViaExec(machineId, sessionId).catch((err) => {
          logger.warn('[MachineManager] racko-app install via exec failed (non-fatal)', {
            machineId,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        break;
      }
    }
  }

  /**
   * Sends a PowerShell exec command to the agent to install racko-app + WebView2.
   * Called after agent connects on WS following a push. Runs as SYSTEM on the VM.
   * Uses a 10-minute timeout — enough for the 72MB zip download + extract + WebView2.
   * Emits racko_app_installed SSE event on the push session when done.
   */
  private async installRackoAppViaExec(machineId: string, sessionId: string): Promise<void> {
    const { wsManager } = await import('./websocket/wsManager');
    const { config } = await import('../../config');

    const machine = await MachineModel.findById(machineId).lean();
    if (!machine?.agentId) return;

    // Brief delay to let the agent fully initialize its WS read loop
    await new Promise((r) => setTimeout(r, 3000));

    if (!wsManager.isConnected(machine.agentId)) {
      logger.warn('[MachineManager] installRackoAppViaExec — agent not connected yet, skipping', {
        machineId, agentId: machine.agentId,
      });
      return;
    }

    const platformUrl = config.GATEWAY_URL ?? config.FRONTEND_URL ?? 'http://localhost:8000';
    const installDir = 'C:\\ProgramData\\racko-agent';
    const appVersion = (config.RACKO_APP_VERSION ?? '').trim();

    // PowerShell script runs on the VM as SYSTEM:
    // 1. Download racko-app.zip
    // 2. Extract to C:\ProgramData\racko-agent\racko-app\
    // 3. Install WebView2 (skips if already present)
    // 4. Create desktop shortcut
    // 5. Launch app for the logged-in user
    const script = [
      '$ErrorActionPreference = "Stop"',
      `$installDir = '${installDir}'`,
      `$platformUrl = '${platformUrl}'`,
      '$appZipUrl = "$platformUrl/api/v1/agent/binary/racko-app"',
      '$appDir = "$installDir\\racko-app"',
      '$appZip = "$installDir\\racko-app.zip"',
      'Write-Host "[racko] Downloading Racko App..."',
      'Invoke-WebRequest -Uri $appZipUrl -OutFile $appZip -UseBasicParsing',
      'Write-Host "[racko] Extracting Racko App..."',
      'Expand-Archive -Path $appZip -DestinationPath $appDir -Force',
      'Remove-Item $appZip -Force -ErrorAction SilentlyContinue',
      'Write-Host "[racko] Creating desktop shortcut..."',
      '$wsh = New-Object -ComObject WScript.Shell',
      '$shortcut = $wsh.CreateShortcut("$env:PUBLIC\\Desktop\\Racko Shared Files.lnk")',
      '$shortcut.TargetPath = "$appDir\\racko-app.exe"',
      '$shortcut.WorkingDirectory = $appDir',
      '$shortcut.Description = "Racko Shared Files"',
      '$shortcut.Save()',
      // Install WebView2 if not already present — checks registry first, skips if installed
      '$wv2Key = "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"',
      '$wv2Ver = (Get-ItemProperty -Path "HKLM:\\$wv2Key" -Name pv -ErrorAction SilentlyContinue).pv',
      'if (-not $wv2Ver -or $wv2Ver -eq "0.0.0.0") {',
      '  Write-Host "[racko] Installing WebView2 Runtime..."',
      '  $wv2Path = "$installDir\\WebView2Setup.exe"',
      '  Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $wv2Path -UseBasicParsing',
      '  Start-Process $wv2Path -ArgumentList "/silent /install" -Wait',
      '  Remove-Item $wv2Path -Force -ErrorAction SilentlyContinue',
      '  Write-Host "[racko] WebView2 installed."',
      '} else { Write-Host "[racko] WebView2 already installed, skipping." }',
      'Write-Host "[racko] Launching Racko App..."',
      'Start-Process "$appDir\\racko-app.exe"',
      `[System.IO.File]::WriteAllText("$installDir\\racko-app-version.txt", '${appVersion}', [System.Text.UTF8Encoding]::new($false))`,
      'Write-Host "[racko] Racko App setup complete."',
    ].join('; ');

    const commandId = `racko-app-setup-${machineId}`;
    // 10 minutes — enough for 72MB download + extract + WebView2 on a slow connection
    const result = await wsManager.sendExec(machine.agentId, commandId, script, 10 * 60 * 1000);

    logger.info('[MachineManager] installRackoAppViaExec completed', {
      machineId,
      agentId: machine.agentId,
      exitCode: result.exitCode,
      output: result.output.slice(0, 500),
    });

    // Emit racko_app_installed SSE event — browser shows success/failure in real time
    const { emitPushEvent } = await import('./push.events');
    const success = result.exitCode === 0;
    emitPushEvent(sessionId, {
      type: 'racko_app_installed',
      machineId,
      success,
      error: success ? undefined : `Exit code ${result.exitCode}: ${result.output.slice(-300)}`,
    });
    logger.info('[MachineManager] racko_app_installed event emitted', {
      sessionId, machineId, success, exitCode: result.exitCode,
    });
    // Persist racko_app_installed for page-refresh recovery
    void PushSessionModel.updateOne(
      { sessionId, 'machines.machineId': machineId },
      {
        $set: {
          'machines.$.rackoAppInstalled': success,
          'machines.$.rackoAppError': success ? null : `Exit code ${result.exitCode}: ${result.output.slice(-300)}`,
        },
      }
    ).catch(() => { /* non-fatal */ });
  }

  /**
   * Reset one or more machines — sends { type: "reset", payload: { sessionId } } to each
   * connected agent via WebSocket. Fire-and-forget: returns immediately, agent runs the
   * full reset PowerShell script in a background goroutine and sends back SSE progress events.
   * Also clears all job history for each machine so the machine appears fresh after reset.
   */
  async resetMachines(
    machineIds: string[],
    adminId: mongoose.Types.ObjectId,
    sessionId: string
  ): Promise<{ accepted: string[]; offline: string[] }> {
    const { wsManager } = await import('./websocket/wsManager');
    const accepted: string[] = [];
    const offline: string[] = [];

    await Promise.all(
      machineIds.map(async (machineId) => {
        const id = new mongoose.Types.ObjectId(machineId);
        const doc = await this.findOwnedMachine(id, adminId);

        if (!doc.agentId || !wsManager.isConnected(doc.agentId)) {
          offline.push(machineId);
          logger.warn('[MachineManager] Reset skipped — agent offline', { machineId, agentId: doc.agentId });
          return;
        }

        // Send reset command — agent runs script in background goroutine
        wsManager.sendReset(doc.agentId, sessionId);
        accepted.push(machineId);

        // Clear job history so machine appears fresh after reset
        await JobModel.deleteMany({ machineId: new mongoose.Types.ObjectId(machineId) });

        // Clear activity log — machine is back to baseline state, slate wiped clean
        const { clearActivityLog } = await import('./tracker.service');
        await clearActivityLog(new mongoose.Types.ObjectId(machineId));

        logger.info('[MachineManager] Reset initiated', {
          machineId,
          agentId: doc.agentId,
          sessionId,
        });
      })
    );

    return { accepted, offline };
  }

  removeResetSession(sessionId: string): void {
    logger.info('[MachineManager] Reset session removed', { sessionId });
  }

  async execCommand(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId,
    command: string
  ): Promise<{ output: string; exitCode: number }> {
    const doc = await this.findOwnedMachine(id, adminId);
    if (!doc.agentId) throw new NotFoundError('Machine has no registered agent.');

    const { wsManager } = await import('./websocket/wsManager');
    if (!wsManager.isConnected(doc.agentId)) {
      throw new NotFoundError('Agent is offline. Commands can only be run on online machines.');
    }

    const { v4: uuidv4 } = await import('uuid');
    const commandId = uuidv4();

    const result = await wsManager.sendExec(doc.agentId, commandId, command);
    return { output: result.output, exitCode: result.exitCode };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private async findOwnedMachine(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<IMachine> {
    const doc = await MachineModel.findById(id);
    if (!doc) throw new NotFoundError('Machine not found.');
    if (doc.adminId.toString() !== adminId.toString()) {
      throw new ForbiddenError('You do not have permission to access this machine.');
    }
    return doc;
  }
}

export const machineManagerService = new MachineManagerService();

// ─── Version comparison helper ────────────────────────────────────────────────

/**
 * Returns true when agentVersion differs from publishedVersion.
 *
 * The version strings are git SHAs (e.g. "cc6b4450719406c1...") injected at
 * build time via --ldflags. A SHA is not semver — any difference means the
 * agent is outdated and should update. Simple string inequality is correct.
 *
 * "dev" is treated as outdated when a real version is published, so development
 * builds always get updated when deployed alongside a versioned binary.
 */
function isVersionOutdated(agentVersion: string, publishedVersion: string): boolean {
  if (!agentVersion || agentVersion === 'dev') return true;
  return agentVersion !== publishedVersion;
}
