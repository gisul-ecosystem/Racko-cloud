import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { machineManagerService } from './machine-manager.service';
import { MachineModel, JobModel } from './machine-manager.model';
import { config } from '../../config';
import { jobStatusEmitter } from './job.events';
import { issueJobStreamTicket, consumeJobStreamTicket } from './job.streamTicket';
import type { AuthenticatedRequest } from '../../types';
import type {
  CreateMachineInput,
  BulkCreateMachineInput,
  CreateJobInput,
  AgentRegisterInput,
  AgentEnrollInput,
  PushAgentInput,
  AgentJobResultInput,
  AgentHeartbeatInput,
} from './machine-manager.validation';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class MachineManagerController {
  // ─── Machines ──────────────────────────────────────────────────────────────

  /** POST /api/v1/machines */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const machine = await machineManagerService.addMachine(
        req.body as CreateMachineInput,
        adminId
      );
      success(res, 'Machine added.', { machine }, 201);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/machines/bulk */
  async bulkCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const { machines } = req.body as BulkCreateMachineInput;
      const created = await machineManagerService.bulkAddMachines(machines, adminId);
      success(res, 'Machines added.', { machines: created, total: created.length }, 201);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/machines */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const machines = await machineManagerService.listMachines(adminId);
      success(res, 'Machines retrieved.', { machines, total: machines.length });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/machines/:id */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const machine = await machineManagerService.getMachine(id, adminId);
      success(res, 'Machine retrieved.', { machine });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/machines/:id */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      await machineManagerService.deleteMachine(id, adminId);
      success(res, 'Machine deleted.');
    } catch (err) {
      next(err);
    }
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  /** POST /api/v1/machines/jobs */
  async createJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const jobs = await machineManagerService.createJobs(
        req.body as CreateJobInput,
        adminId
      );
      success(res, 'Install jobs created.', { jobs, total: jobs.length }, 201);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/machines/jobs */
  async listJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const jobs = await machineManagerService.listJobs(adminId);
      success(res, 'Jobs retrieved.', { jobs, total: jobs.length });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/machines/jobs/:id */
  async getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const job = await machineManagerService.getJob(id, adminId);
      success(res, 'Job retrieved.', { job });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/machines/push-agent — VM flow: create machines + SSH/WinRM push */
  async pushAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const { vms } = req.body as PushAgentInput;
      const result = await machineManagerService.pushAgentToVMs(vms, adminId);
      success(res, 'Agent push initiated.', result, 201);
    } catch (err) {
      next(err);
    }
  }

  // ─── Agent (no auth — token-based) ────────────────────────────────────────

  /**
   * POST /api/v1/machines/:id/download-agent/token  (authenticated)
   * Issues a 60-second single-use download token. Frontend calls this with JWT,
   * then constructs a plain browser-navigable URL using the returned token.
   */
  async issueDownloadToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const os = (req.query['os'] as string) ?? 'windows';
      const result = await machineManagerService.issueDownloadToken(id, adminId, os);
      success(res, 'Download token issued.', result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/machines/download-agent?dt=<token>  (public — no auth)
   * Redeems a single-use download token and serves the pre-built generic agent binary.
   * The token is consumed immediately (single-use, 60s TTL).
   * User double-clicks the binary → GUI prompts for token → installs as service.
   */
  async redeemDownloadToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dt = req.query['dt'] as string;
      if (!dt) {
        res.status(400).json({ success: false, message: 'dt query param required.' });
        return;
      }

      // Validate + consume the token (throws if invalid/expired)
      await machineManagerService.redeemDownloadToken(dt);

      const osParam = (req.query['os'] as string) ?? 'windows';
      const path = await import('path');
      const fs = await import('fs');

      const fileMap: Record<string, { file: string; name: string }> = {
        windows: { file: 'racko-agent-setup.exe', name: 'racko-agent-setup.exe' },
        linux:   { file: 'racko-agent',            name: 'racko-agent' },
        macos:   { file: 'racko-agent-mac',        name: 'racko-agent' },
      };

      const entry = fileMap[osParam] ?? fileMap['windows'];
      const binaryPath = path.resolve(process.cwd(), '..', 'agent', 'dist', entry.file);

      if (!fs.existsSync(binaryPath)) {
        res.status(404).json({
          success: false,
          message: `Agent binary not found. Run 'go build -o dist/${entry.file} .' in the agent/ directory first.`,
        });
        return;
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${entry.name}"`);
      res.setHeader('Cache-Control', 'no-store'); // never cache — token is single-use
      fs.createReadStream(binaryPath).pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/machines/:id/download-agent?os=windows|linux|macos */
  async downloadAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const os = (req.query['os'] as string) ?? 'windows';
      const info = await machineManagerService.getAgentDownloadInfo(id, adminId);
      success(res, 'Agent download info retrieved.', {
        accountToken: info.accountToken,
        platformUrl: info.platformUrl,
        os,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/agent/binary/:os — serves pre-built agent binary (public)
   * Called by the install script to download the generic agent binary.
   * Binary must be pre-built and placed in agent/dist/ before deployment.
   */
  async serveBinary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const path = await import('path');
      const fs = await import('fs');

      const os = req.params['os'] as string;
      const fileMap: Record<string, { file: string; name: string }> = {
        windows: { file: 'racko-agent.exe',     name: 'racko-agent.exe' },
        linux:   { file: 'racko-agent',          name: 'racko-agent' },
        darwin:  { file: 'racko-agent-mac',      name: 'racko-agent' },
      };

      const entry = fileMap[os];
      if (!entry) {
        res.status(400).json({ success: false, message: `Unsupported OS: ${os}` });
        return;
      }

      // Binary lives in agent/dist/ relative to repo root
      const binaryPath = path.resolve(process.cwd(), '..', 'agent', 'dist', entry.file);

      if (!fs.existsSync(binaryPath)) {
        res.status(404).json({
          success: false,
          message: `Agent binary for ${os} not found. Run 'make build-all' in the agent/ directory first.`,
        });
        return;
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${entry.name}"`);
      fs.createReadStream(binaryPath).pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/agent/install/linux?token=<accountToken>
   * Serves a shell script that downloads the agent binary and installs it.
   * The accountToken is embedded in the script so the agent can self-register.
   * Usage: curl -fsSL <url> | sudo bash
   */
  async serveLinuxInstallScript(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const accountToken = req.query['token'] as string;
      if (!accountToken) {
        res.status(400).json({ success: false, message: 'token query param required.' });
        return;
      }

      // Just check token exists — no need to consume it, script download is idempotent
      const doc = await MachineModel.findOne({ accountToken });
      if (!doc) {
        res.status(404).json({ success: false, message: 'Invalid token.' });
        return;
      }

      const platformUrl = config.GATEWAY_URL ?? config.API_URL ?? config.FRONTEND_URL ?? 'http://localhost:8000';

      const script = `#!/bin/bash
set -euo pipefail

PLATFORM_URL="${platformUrl}"
ACCOUNT_TOKEN="${accountToken}"
BINARY_URL="${platformUrl}/api/v1/agent/binary/linux"
INSTALL_DIR="/tmp"
BINARY_PATH="$INSTALL_DIR/racko-agent"

echo "[racko] Downloading agent..."
curl -fsSL "$BINARY_URL" -o "$BINARY_PATH"
chmod +x "$BINARY_PATH"

echo "[racko] Installing agent..."
PLATFORM_URL="$PLATFORM_URL" ACCOUNT_TOKEN="$ACCOUNT_TOKEN" "$BINARY_PATH" --install

echo "[racko] Done. Check status: systemctl status racko-agent"
`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(script);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/agent/enroll — VM Template flow: enrollmentKey-based registration */
  async agentEnroll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await machineManagerService.enrollAgent(req.body as AgentEnrollInput);
      success(res, 'Agent enrolled.', result, 201);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/agent/register */
  async agentRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await machineManagerService.registerAgent(
        req.body as AgentRegisterInput
      );
      success(res, 'Agent registered.', result, 201);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/agent/jobs/:agentId */
  async agentGetJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { agentId } = req.params as { agentId: string };
      const job = await machineManagerService.getPendingJobForAgent(agentId);
      // Return empty object (not 404) when no job is pending — agent should keep polling
      success(res, job ? 'Job found.' : 'No pending job.', { job: job ?? null });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/agent/jobs/:jobId/result */
  async agentJobResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobId = new mongoose.Types.ObjectId(req.params['jobId'] as string);
      await machineManagerService.updateJobResult(jobId, req.body as AgentJobResultInput);
      success(res, 'Job result recorded.');
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/agent/heartbeat */
  async agentHeartbeat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await machineManagerService.handleHeartbeat(req.body as AgentHeartbeatInput);
      success(res, 'Heartbeat received.');
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/agent/software-catalog/:id?agentId=xxx
   *  Agent fetches full software record to know install method, package name, fileUrl etc.
   *  No JWT — validated by agentId query param against machines collection.
   */
  async agentGetSoftware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const agentId = req.query['agentId'] as string;
      if (!agentId) {
        res.status(400).json({ success: false, message: 'agentId query param required.' });
        return;
      }
      const software = await machineManagerService.getSoftwareForAgent(id, agentId);
      success(res, 'Software retrieved.', { software });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/machines/jobs/:id/stream-ticket — issue a short-lived SSE stream ticket
   */
  async issueJobStreamTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobId = req.params['id'] as string;
      const adminId = (req as AuthenticatedRequest).user.userId;

      const job = await JobModel.findById(jobId);
      if (!job || job.adminId.toString() !== adminId) {
        res.status(404).json({ success: false, message: 'Job not found.' });
        return;
      }

      const ticket = issueJobStreamTicket(jobId, adminId);
      success(res, 'Stream ticket issued.', ticket);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/machines/jobs/:id/stream?streamToken=xxx — SSE stream for real-time job status
   */
  async streamJobStatus(req: Request, res: Response): Promise<void> {
    const jobId = req.params['id'] as string;
    const rawToken = req.query['streamToken'];
    const streamToken = typeof rawToken === 'string' ? rawToken : '';
    const ticket = streamToken ? consumeJobStreamTicket(streamToken, jobId) : null;

    if (!ticket) {
      res.status(401).json({ success: false, message: 'Unauthorized.' });
      return;
    }

    const job = await JobModel.findById(jobId);
    if (!job || job.adminId.toString() !== ticket.userId) {
      res.status(404).json({ success: false, message: 'Job not found.' });
      return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Send current state immediately
    send({ jobId, status: job.status, logs: job.logs, attempts: job.attempts, softwareId: job.softwareIds[0]?.toString() ?? '' });

    // If already terminal, close immediately
    if (job.status === 'success' || job.status === 'failed') {
      res.end();
      return;
    }

    // Subscribe to live updates
    const listener = (event: object) => {
      send(event);
      const e = event as { status: string };
      if (e.status === 'success' || e.status === 'failed') {
        jobStatusEmitter.removeListener(jobId, listener);
        res.end();
      }
    };

    jobStatusEmitter.on(jobId, listener);

    req.on('close', () => {
      jobStatusEmitter.removeListener(jobId, listener);
    });
  }
}

export const machineManagerController = new MachineManagerController();
