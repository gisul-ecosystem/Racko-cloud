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
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private toJobResponse(doc: IJob): JobResponse {
    return {
      _id: doc._id.toString(),
      machineId: doc.machineId.toString(),
      softwareIds: doc.softwareIds.map((id) => id.toString()),
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

  async deleteMachine(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwnedMachine(id, adminId);
    
    // Soft delete — set deleted flag instead of removing record
    doc.deleted = true;
    doc.status = 'offline';
    await doc.save();

    logger.info('[MachineManager] Soft deleted machine', {
      machineId: id.toString(),
      adminId: adminId.toString(),
    });

    // Notify WebSocket manager to close connection if agent is connected
    const { wsManager } = await import('./websocket/wsManager');
    if (doc.agentId) {
      wsManager.closeConnection(doc.agentId, 4010, 'Machine deleted');
    }
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
    const docs = await JobModel.find({ adminId }).sort({ createdAt: -1 });
    return docs.map((d) => this.toJobResponse(d));
  }

  async getJob(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<JobResponse> {
    const doc = await JobModel.findById(id);
    if (!doc) throw new NotFoundError('Job not found.');
    if (doc.adminId.toString() !== adminId.toString()) {
      throw new ForbiddenError('You do not have permission to access this job.');
    }
    return this.toJobResponse(doc);
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

  async handleHeartbeat(dto: AgentHeartbeatDto): Promise<void> {
    const machine = await MachineModel.findOne({ agentId: dto.agentId });
    if (!machine) throw new NotFoundError('Agent not found.');
    
    // Reject deleted agents
    if (machine.deleted) {
      throw new ForbiddenError('Agent has been deleted.');
    }

    machine.status = dto.status === 'online' ? 'online' : 'offline';
    machine.lastSeen = new Date();
    await machine.save();
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
   * Credentials are passed through to vm-push.service and never persisted.
   */
  async pushAgentToVMs(
    vms: Array<{ name: string; ipAddress: string; os: import('./machine-manager.model').MachineOS; username: string; password: string }>,
    adminId: mongoose.Types.ObjectId
  ): Promise<{ machines: MachineResponse[]; pushResults: import('./vm-push.service').VMPushResult[] }> {
    const { vmPushService } = await import('./vm-push.service');

    const machines: MachineResponse[] = [];
    const pushResults: import('./vm-push.service').VMPushResult[] = [];

    for (const vm of vms) {
      const machine = await this.addMachine(
        { name: vm.name, ipAddress: vm.ipAddress, os: vm.os },
        adminId
      );
      machines.push(machine);

      const result = await vmPushService.pushAgent({
        machineId: machine._id,
        ipAddress: vm.ipAddress,
        os: vm.os,
        username: vm.username,
        password: vm.password,
        accountToken: machine.accountToken,
      });

      pushResults.push(result);
    }

    return { machines, pushResults };
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
