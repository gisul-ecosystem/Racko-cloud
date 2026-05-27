import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { vmService } from './vm.service';
import { logger } from '../../utils/logger';
import type { AuthenticatedRequest } from '../../types';
import type { CreateVMDto, VMFilters } from './vm.types';
import type { GuacamoleProtocol } from '../../utils/guacamoleClient';

// Consistent response shape — matches all other modules
function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class VMController {
  /**
   * GET /api/v1/vms/templates
   */
  async getTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      logger.info('Templates list requested', { userId: authReq.user.userId });
      const templates = await vmService.getTemplates();
      success(res, 'Templates retrieved.', { templates, total: templates.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/templates/:templateId
   */
  async getTemplateDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const templateId = parseInt(req.params['templateId'] as string, 10);
      logger.info('Template details requested', { userId: authReq.user.userId, templateId });
      const template = await vmService.getTemplateDetails(templateId);
      success(res, 'Template details retrieved.', { template });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms
   */
  async createVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const dto = req.body as CreateVMDto;

      logger.info('VM creation requested', {
        userId: authReq.user.userId,
        templateId: dto.templateId,
        count: dto.count,
        cloneType: dto.cloneType,
      });

      const result = await vmService.createVM(dto, adminId, req);
      success(res, 'VM creation job started.', { jobId: result.jobId }, 202);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/vms/:vmId
   */
  async deleteVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      logger.info('VM deletion requested', { userId: authReq.user.userId, vmId: vmId.toString() });

      await vmService.deleteVM(vmId, adminId, req);
      success(res, 'VM deleted successfully.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/start
   */
  async startVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const result = await vmService.startVM(vmId, adminId, req);
      success(res, 'VM started successfully.', { result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/stop
   */
  async stopVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const result = await vmService.stopVM(vmId, adminId, req);
      success(res, 'VM stopped successfully.', { result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/force-stop
   */
  async forceStopVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const result = await vmService.forceStopVM(vmId, adminId, req);
      success(res, 'VM force stopped.', { result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/restart
   */
  async restartVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const result = await vmService.restartVM(vmId, adminId, req);
      success(res, 'VM restarted successfully.', { result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/reset
   */
  async resetVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const result = await vmService.resetVM(vmId, adminId, req);
      success(res, 'VM reset successfully.', { result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/:vmId/status
   */
  async getVMStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const status = await vmService.getVMStatus(vmId, adminId, req);
      success(res, 'VM status retrieved.', { status });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms
   */
  async getMyVMs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const query = req.query as { status?: string; cloneType?: string; node?: string };

      const filters: VMFilters = {};
      if (query.status) filters.status = query.status;
      if (query.cloneType) filters.cloneType = query.cloneType as VMFilters['cloneType'];
      if (query.node) filters.node = query.node;

      const vms = await vmService.getMyVMs(adminId, filters);
      success(res, 'VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/:vmId
   */
  async getVMDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const details = await vmService.getVMDetails(vmId, adminId, req);
      success(res, 'VM details retrieved.', details);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/jobs
   */
  async listJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const limit = Math.min(parseInt((req.query['limit'] as string) ?? '20', 10) || 20, 100);
      const jobs = await vmService.listJobs(adminId, req, limit);
      success(res, 'Jobs retrieved.', { jobs, total: jobs.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/jobs/:jobId
   */
  async getJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const jobId = new mongoose.Types.ObjectId(req.params['jobId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const job = await vmService.getJobStatus(jobId, adminId, req);
      success(res, 'Job status retrieved.', { job });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/:vmId/events
   */
  async getVMEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const events = await vmService.getVMEvents(vmId, adminId, req);
      success(res, 'VM events retrieved.', { events, total: events.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/:vmId/console
   *
   * Returns a one-shot browser URL to open a Guacamole console session for
   * the VM. The URL points at GUACAMOLE_PUBLIC_URL — never the internal
   * docker hostname.
   *
   * Query: ?protocol=rdp|ssh|vnc (default: rdp)
   */
  async openConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const protocol = req.query['protocol'] as GuacamoleProtocol | undefined;

      const session = await vmService.openConsole(vmId, adminId, req, protocol);
      success(res, 'VM console session created.', session);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/admin/all — super_admin only
   */
  async getAllVMsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as { status?: string; cloneType?: string; node?: string };

      const filters: VMFilters = {};
      if (query.status) filters.status = query.status;
      if (query.cloneType) filters.cloneType = query.cloneType as VMFilters['cloneType'];
      if (query.node) filters.node = query.node;

      const vms = await vmService.getAllVMsAdmin(filters);
      success(res, 'All VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }
}

export const vmController = new VMController();
