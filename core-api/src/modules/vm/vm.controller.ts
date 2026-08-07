import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { vmService } from './vm.service';
import { bulkAssignJobService } from '../bulkAssignJob/bulkAssignJob.service';
import { logger } from '../../utils/logger';
import type { AuthenticatedRequest } from '../../types';
import type { CreateVMDto, VMFilters } from './vm.types';
import type { GuacamoleProtocol } from '../../utils/guacamoleClient';
import { adminBillingService } from '../adminBilling/adminBilling.service';
import type { AccessScheduleInput } from '../vmAccessSchedule/accessScheduleParse';
import { projectsService } from '../projects/projects.service';

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
      const templates = await vmService.getTemplates(req);
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
      const template = await vmService.getTemplateDetails(templateId, req);
      success(res, 'Template details retrieved.', { template });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/templates/catalog — super admin template picker
   */
  async getTemplateCatalog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      logger.info('Template catalog requested', { userId: authReq.user.userId });
      const catalog = await vmService.getTemplateCatalog();
      success(res, 'Template catalog retrieved.', catalog);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/vms/templates/selection — super admin saves enabled templates
   */
  async setTemplateSelection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const updatedBy = new mongoose.Types.ObjectId(authReq.user.userId);
      const { enabledVmids } = req.body as { enabledVmids: number[] };

      const result = await vmService.setTemplateSelection(enabledVmids, updatedBy);
      success(res, 'Template selection saved.', result);
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

      // ── Billing: debit admin wallet if pricing is configured ──────────────
      // Resolve actual specs (use overrides if provided, else fall back to template details)
      let cpuCores = dto.cpuCores;
      let memoryGb = dto.memoryGb;
      let diskGb = dto.diskGb;

      if (!cpuCores || !memoryGb || !diskGb) {
        try {
          const details = await vmService.getTemplateDetails(dto.templateId, req);
          cpuCores = cpuCores ?? details.cpuCores;
          memoryGb = memoryGb ?? details.memoryGb;
          diskGb = diskGb ?? details.diskGb;
        } catch {
          // If template details fail, proceed without billing
        }
      }

      let debitedAmount = 0;
      const projectCtx = dto.projectId
        ? await projectsService.assertUsableForService({
            projectId: dto.projectId,
            actingUserId: authReq.user.userId,
            serviceKey: 'vm-management',
          })
        : null;

      if (cpuCores && memoryGb && diskGb) {
        const quote = await adminBillingService.quoteVmCreation(
          dto.templateId,
          cpuCores,
          memoryGb,
          diskGb,
          dto.count ?? 1,
          'monthly'
        );

        if (quote.grandTotal > 0) {
          // Will throw INSUFFICIENT_BALANCE (402) if wallet is too low
          await adminBillingService.debitWallet(
            authReq.user.userId,
            quote.grandTotal,
            null, // jobId patched in after creation below
            'vm_creation',
            {
              projectId: projectCtx?.projectId.toString() ?? null,
              orgId: projectCtx?.orgId ?? null,
              serviceKey: 'vm-management',
            }
          );
          debitedAmount = quote.grandTotal;
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      const result = await vmService.createVM(dto, adminId, req);

      // Patch the transaction with the real jobId (best-effort, non-blocking)
      if (debitedAmount > 0) {
        void adminBillingService
          .patchLatestTransactionJobId(authReq.user.userId, result.jobId)
          .catch((err: unknown) =>
            logger.warn('Failed to patch admin wallet transaction jobId', {
              userId: authReq.user.userId,
              jobId: result.jobId,
              error: err instanceof Error ? err.message : String(err),
            })
          );
      }

      success(res, 'VM creation job started.', { jobId: result.jobId }, 202);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/clone
   */
  async cloneVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const { name, count = 1 } = req.body as { name: string; count?: number };

      logger.info('[VMClone] Clone requested', {
        userId: authReq.user.userId,
        sourceVmId: vmId.toString(),
        name,
        count,
      });

      const result = await vmService.cloneVM(vmId, adminId, name, req, count);
      success(res, 'VM clone job started.', { jobId: result.jobId }, 202);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/clones
   */
  async getClonedVMs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const vms = await vmService.getClonedVMs(adminId);
      success(res, 'Cloned VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/bulk-delete
   */
  async bulkDeleteVMs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const { vmIds } = req.body as { vmIds: string[] };

      logger.info('[VMDelete] Bulk delete requested', {
        userId: authReq.user.userId,
        count: vmIds.length,
      });

      const result = await vmService.bulkDeleteVMs(vmIds, adminId, req);
      success(res, 'Bulk delete job started.', { jobId: result.jobId, restrictedSkipped: result.restrictedSkipped }, 202);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/bulk-start
   */
  async bulkStartVMs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const { vmIds } = req.body as { vmIds: string[] };

      logger.info('[VMBulkStart] Bulk start requested', {
        userId: authReq.user.userId,
        count: vmIds.length,
      });

      const result = await vmService.bulkStartVMs(vmIds, adminId, req);
      success(res, `${result.succeeded} VM(s) started.`, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/bulk-stop
   */
  async bulkStopVMs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const { vmIds } = req.body as { vmIds: string[] };

      logger.info('[VMBulkStop] Bulk stop requested', {
        userId: authReq.user.userId,
        count: vmIds.length,
      });

      const result = await vmService.bulkStopVMs(vmIds, adminId, req);
      success(res, `${result.succeeded} VM(s) stopped.`, result);
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

      logger.info('[VMDelete] API delete requested', {
        userId: authReq.user.userId,
        vmId: vmId.toString(),
      });

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
   * POST /api/v1/vms/:vmId/hibernate
   */
  async hibernateVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const result = await vmService.hibernateVM(vmId, adminId, req);
      success(res, 'VM hibernated successfully.', { result });
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

  // ─── Virtualization (Hyper-V) ─────────────────────────────────────────────

  /**
   * GET /api/v1/vms/:vmId/virtualization
   */
  async getVirtualizationStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      const status = await vmService.getVirtualizationStatus(vmId, adminId, req);
      success(res, 'Virtualization status retrieved.', status);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/virtualization/enable
   */
  async enableVirtualization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      logger.info('Virtualization enable requested', { userId: authReq.user.userId, vmId: vmId.toString() });
      const status = await vmService.enableVirtualization(vmId, adminId, req);
      success(res, 'Virtualization enablement started.', status, 202);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/virtualization/cancel
   */
  async cancelVirtualization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      logger.info('Virtualization cancel requested', { userId: authReq.user.userId, vmId: vmId.toString() });
      const status = await vmService.cancelVirtualization(vmId, adminId, req);
      success(res, 'Virtualization operation cancelled.', status);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/software/cancel
   */
  async cancelSoftwareInstalls(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      logger.info('Software install cancel requested', { userId: authReq.user.userId, vmId: vmId.toString() });
      await vmService.cancelSoftwareInstalls(vmId, adminId, req);
      success(res, 'Software installations cancelled.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/:vmId/virtualization/disable
   */
  async disableVirtualization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      logger.info('Virtualization disable requested', { userId: authReq.user.userId, vmId: vmId.toString() });
      const status = await vmService.disableVirtualization(vmId, adminId, req);
      success(res, 'Virtualization disable started.', status, 202);
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
      const query = req.query as { status?: string; cloneType?: string; node?: string; isRestricted?: string };

      const filters: VMFilters = {};
      if (query.status) filters.status = query.status;
      if (query.cloneType) filters.cloneType = query.cloneType as VMFilters['cloneType'];
      if (query.node) filters.node = query.node;
      if (query.isRestricted === 'true') filters.isRestricted = true;
      else if (query.isRestricted === 'false') filters.isRestricted = false;

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

      const { job, vms } = await vmService.getJobStatus(jobId, adminId, req);
      success(res, 'Job status retrieved.', { job, vms });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/vms/jobs/:jobId/cancel
   */
  async cancelJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const jobId = new mongoose.Types.ObjectId(req.params['jobId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      logger.info('[JobCancel] Cancel requested', {
        userId: authReq.user.userId,
        jobId: jobId.toString(),
      });

      const result = await vmService.cancelJob(jobId, adminId, req);
      success(res, 'Job cancellation requested.', result);
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
   * Query: ?protocol=rdp|ssh|vnc (default: rdp)&width=1920&height=1080
   */
  async openConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const protocol = req.query['protocol'] as GuacamoleProtocol | undefined;

      const rawWidth = req.query['width'] as string | undefined;
      const rawHeight = req.query['height'] as string | undefined;
      const width = rawWidth ? parseInt(rawWidth, 10) : undefined;
      const height = rawHeight ? parseInt(rawHeight, 10) : undefined;
      const dimensions = {
        width: width && Number.isFinite(width) && width > 0 ? width : undefined,
        height: height && Number.isFinite(height) && height > 0 ? height : undefined,
      };

      const session = await vmService.openConsole(vmId, adminId, req, protocol, dimensions);
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

  // ─── Assignment endpoints ───────────────────────────────────────────────────

  /**
   * GET /api/v1/vms/assign/counts
   */
  async getAssignedVMCounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const counts = await vmService.getAssignedVMCounts(adminId);
      success(res, 'Assigned VM counts retrieved.', { counts });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/assign/available
   */
  async getAvailableVMs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const vms = await vmService.getAvailableVMs(adminId);
      success(res, 'Available VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/assign/user/:userId
   */
  async getAssignedVMsForUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const targetUserId = new mongoose.Types.ObjectId(req.params['userId'] as string);
      const vms = await vmService.getAssignedVMsForUser(targetUserId, adminId);
      success(res, 'Assigned VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/assign
   */
  async assignVMs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const { userId, vmIds, accessSchedule } = req.body as {
        userId: string;
        vmIds: string[];
        accessSchedule?: AccessScheduleInput;
      };
      const targetUserId = new mongoose.Types.ObjectId(userId);
      const vmObjectIds = vmIds.map((id: string) => new mongoose.Types.ObjectId(id));

      logger.info('VM assignment requested', {
        adminId: adminId.toString(),
        targetUserId: userId,
        count: vmIds.length,
      });

      const result = await vmService.assignVMs(vmObjectIds, targetUserId, adminId, accessSchedule);
      success(res, `${result.assigned} VM(s) assigned successfully.`, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vms/assign/bulk — 1:1 bulk assign (create users or use existing)
   */
  async bulkAssignOneToOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const body = req.body as {
        vmIds: string[];
        mode: 'create' | 'existing';
        emailPrefix?: string;
        passwordMode?: 'auto' | 'shared';
        sharedPassword?: string;
        userIds?: string[];
      };

      logger.info('Bulk 1:1 VM assignment job requested', {
        adminId: adminId.toString(),
        mode: body.mode,
        vmCount: body.vmIds.length,
      });

      const { jobId } = await bulkAssignJobService.startJob(
        {
          kind: 'platform_vm',
          total: body.vmIds.length,
          request: body as unknown as Record<string, unknown>,
          adminId,
        },
        async () => {
          const result = await vmService.bulkAssignOneToOne(body, adminId);
          return {
            assigned: result.assigned,
            failed: result.failed,
            pairs: result.pairs.map((p) => ({
              resourceId: p.vmId,
              resourceName: p.vmName,
              userId: p.userId,
              userEmail: p.userEmail,
              password: p.password,
              status: p.status,
              error: p.error,
            })),
          };
        }
      );

      success(res, 'Bulk assign job started.', { jobId }, 202);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/assign/jobs/:jobId — poll bulk assign job
   */
  async getBulkAssignJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const jobId = req.params['jobId'] as string;
      const { job, pairs } = await bulkAssignJobService.getJobForAdmin(
        jobId,
        adminId,
        'platform_vm'
      );
      success(res, 'Bulk assign job retrieved.', {
        job,
        pairs: pairs.map((p) => ({
          vmId: p.resourceId,
          vmName: p.resourceName,
          userId: p.userId,
          userEmail: p.userEmail,
          password: p.password,
          status: p.status,
          error: p.error,
        })),
        assigned: job.completed,
        failed: job.failed,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/vms/assign/:vmId
   */
  async unassignVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);

      logger.info('VM unassignment requested', {
        adminId: adminId.toString(),
        vmId: vmId.toString(),
      });

      await vmService.unassignVM(vmId, adminId);
      success(res, 'VM unassigned successfully.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vms/my-assigned — user role
   */
  async getMyAssignedVMs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = new mongoose.Types.ObjectId(authReq.user.userId);
      const vms = await vmService.getMyAssignedVMs(userId);
      success(res, 'Assigned VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/vms/:vmId/restrict
   */
  async restrictVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      logger.info('[VMRestrict] Restrict requested', { userId: authReq.user.userId, vmId: vmId.toString() });
      await vmService.restrictVM(vmId, adminId, req);
      success(res, 'VM restricted successfully.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/vms/:vmId/unrestrict
   */
  async unrestrictVM(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

      logger.info('[VMRestrict] Unrestrict requested', { userId: authReq.user.userId, vmId: vmId.toString() });
      await vmService.unrestrictVM(vmId, adminId, req);
      success(res, 'VM unrestricted successfully.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/vms/:vmId/schedule
   */
  async updateVmSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const data = await vmService.updateVmSchedule(
        vmId,
        adminId,
        authReq.user.role,
        req.body as AccessScheduleInput,
        req
      );
      success(res, 'VM access schedule updated.', data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/vms/:vmId/override — super_admin
   */
  async updateVmOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vmId = new mongoose.Types.ObjectId(req.params['vmId'] as string);
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const data = await vmService.updateVmOverride(
        vmId,
        adminId,
        req.body as { accessOverride: boolean; accessOverrideUntil?: string | null },
        req
      );
      success(res, 'VM access override updated.', data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/vms/override/bulk — grant/revoke override for many VMs (1-click)
   */
  async bulkUpdateVmOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const body = req.body as {
        vmIds: string[];
        accessOverride: boolean;
        accessOverrideUntil?: string | null;
      };
      const vmIds = body.vmIds.map((id) => new mongoose.Types.ObjectId(id));
      const data = await vmService.bulkUpdateVmOverride(
        vmIds,
        adminId,
        {
          accessOverride: body.accessOverride,
          accessOverrideUntil: body.accessOverrideUntil,
        },
        req
      );
      success(res, `Override applied to ${data.updated} VM(s).`, data);
    } catch (error) {
      next(error);
    }
  }
}

export const vmController = new VMController();
