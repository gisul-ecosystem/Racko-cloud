import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { externalVMService } from '../external-vm/external-vm.service';
import { bulkAssignJobService } from '../bulkAssignJob/bulkAssignJob.service';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import type { TenantBulkAssignExternalPairsDto } from '../external-vm/external-vm.types';
import type { CreateExternalVMInput, BulkCreateExternalVMInput } from '../external-vm/external-vm.validation';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

function tenantActor(req: Request) {
  const authReq = req as TenantAuthenticatedRequest;
  return {
    id: authReq.tenantUser.id,
    tenantId: authReq.tenantUser.tenantId,
    role: authReq.tenantUser.role,
  };
}

function tenantIds(req: Request): {
  tenantId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
} {
  const authReq = req as TenantAuthenticatedRequest;
  return {
    tenantId: new mongoose.Types.ObjectId(authReq.tenantUser.tenantId),
    tenantUserId: new mongoose.Types.ObjectId(authReq.tenantUser.id),
  };
}

export class TenantExternalVmController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, tenantUserId } = tenantIds(req);
      const vm = await externalVMService.addTenantExternalVM(
        req.body as CreateExternalVMInput,
        tenantId,
        tenantUserId
      );
      success(res, 'External VM added.', { externalVm: vm }, 201);
    } catch (err) {
      next(err);
    }
  }

  async bulkCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, tenantUserId } = tenantIds(req);
      const { vms } = req.body as BulkCreateExternalVMInput;
      const created = await externalVMService.bulkAddTenantExternalVMs(vms, tenantId, tenantUserId);
      success(res, 'External VMs added.', { externalVms: created, total: created.length }, 201);
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vms = await externalVMService.listTenantExternalVMs(tenantActor(req));
      success(res, 'External VMs retrieved.', { externalVms: vms, total: vms.length });
    } catch (err) {
      next(err);
    }
  }

  async getAvailable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = tenantIds(req);
      const excludeUserId = req.query['userId'] as string | undefined;
      const vms = await externalVMService.getAvailableTenantExternalVMs(
        tenantId,
        excludeUserId && mongoose.Types.ObjectId.isValid(excludeUserId)
          ? { excludeTenantUserId: new mongoose.Types.ObjectId(excludeUserId) }
          : undefined
      );
      success(res, 'Available servers retrieved.', { externalVms: vms, total: vms.length });
    } catch (err) {
      next(err);
    }
  }

  async getAssignedCounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = tenantIds(req);
      const counts = await externalVMService.getTenantAssignedCounts(tenantId);
      success(res, 'Assignment counts retrieved.', { counts });
    } catch (err) {
      next(err);
    }
  }

  async getAssignedForUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, tenantUserId } = tenantIds(req);
      const targetUserId = new mongoose.Types.ObjectId(req.params['userId'] as string);
      const vms = await externalVMService.getAssignedTenantExternalVMsForUser(
        targetUserId,
        tenantId,
        tenantUserId
      );
      success(res, 'Assigned servers retrieved.', { externalVms: vms, total: vms.length });
    } catch (err) {
      next(err);
    }
  }

  async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, tenantUserId } = tenantIds(req);
      const { userId, externalVmIds, accessSchedule } = req.body as {
        userId: string;
        externalVmIds: string[];
        accessSchedule?: import('../vmAccessSchedule/accessScheduleParse').AccessScheduleInput;
      };
      const result = await externalVMService.assignTenantExternalVMs(
        externalVmIds.map((id) => new mongoose.Types.ObjectId(id)),
        new mongoose.Types.ObjectId(userId),
        tenantId,
        tenantUserId,
        accessSchedule
      );
      const skippedNote =
        result.skipped > 0 ? ` (${result.skipped} already assigned to this user)` : '';
      success(
        res,
        `${result.assigned} server(s) assigned successfully${skippedNote}.`,
        result
      );
    } catch (err) {
      next(err);
    }
  }

  async bulkAssignOneToOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, tenantUserId } = tenantIds(req);
      const body = req.body as TenantBulkAssignExternalPairsDto;
      const { jobId } = await bulkAssignJobService.startJob(
        {
          kind: 'tenant_external_vm',
          total: body.externalVmIds.length,
          request: body as unknown as Record<string, unknown>,
          tenantId,
          createdByTenantUserId: tenantUserId,
        },
        async () => {
          const result = await externalVMService.bulkAssignTenantOneToOne(
            body,
            tenantId,
            tenantUserId
          );
          return {
            assigned: result.assigned,
            failed: result.failed,
            pairs: result.pairs.map((p) => ({
              resourceId: p.externalVmId,
              resourceName: p.externalVmName,
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
    } catch (err) {
      next(err);
    }
  }

  async getBulkAssignJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, tenantUserId } = tenantIds(req);
      const jobId = req.params['jobId'] as string;
      const { job, pairs } = await bulkAssignJobService.getJobForTenant(
        jobId,
        tenantId,
        tenantUserId
      );
      success(res, 'Bulk assign job retrieved.', {
        job,
        pairs: pairs.map((p) => ({
          externalVmId: p.resourceId,
          externalVmName: p.resourceName,
          userId: p.userId,
          userEmail: p.userEmail,
          password: p.password,
          status: p.status,
          error: p.error,
        })),
        assigned: job.completed,
        failed: job.failed,
      });
    } catch (err) {
      next(err);
    }
  }

  async unassign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = tenantIds(req);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const userIdRaw = (req.query['userId'] as string | undefined) ?? (req.body as { userId?: string })?.userId;
      if (!userIdRaw || !mongoose.Types.ObjectId.isValid(userIdRaw)) {
        res.status(400).json({ success: false, message: 'userId is required.' });
        return;
      }
      await externalVMService.unassignTenantExternalVM(
        id,
        tenantId,
        new mongoose.Types.ObjectId(userIdRaw)
      );
      success(res, 'Server unassigned successfully.');
    } catch (err) {
      next(err);
    }
  }

  async updateSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const data = await externalVMService.updateTenantExternalVmSchedule(
        id,
        tenantActor(req),
        req.body
      );
      success(res, 'Server access schedule updated.', data);
    } catch (err) {
      next(err);
    }
  }

  async updateOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const data = await externalVMService.updateTenantExternalVmOverride(
        id,
        tenantActor(req),
        req.body as { accessOverride: boolean; accessOverrideUntil?: string | null }
      );
      success(res, 'Server access override updated.', data);
    } catch (err) {
      next(err);
    }
  }

  async bulkUpdateOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ids, ...body } = req.body as {
        ids: string[];
        accessOverride: boolean;
        accessOverrideUntil?: string | null;
      };
      const data = await externalVMService.bulkUpdateTenantExternalVmOverride(
        ids.map((id) => new mongoose.Types.ObjectId(id)),
        tenantActor(req),
        body
      );
      success(res, `Access override updated for ${data.updated} server(s).`, data);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const vm = await externalVMService.getTenantExternalVM(id, tenantActor(req));
      success(res, 'External VM retrieved.', { externalVm: vm });
    } catch (err) {
      next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = tenantIds(req);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      await externalVMService.deleteTenantExternalVM(id, tenantId);
      success(res, 'External VM deleted.');
    } catch (err) {
      next(err);
    }
  }

  async bulkRemove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = tenantIds(req);
      const { ids } = req.body as { ids: string[] };
      const result = await externalVMService.bulkDeleteTenantExternalVMs(
        ids.map((id) => new mongoose.Types.ObjectId(id)),
        tenantId
      );
      success(res, `${result.deleted} server(s) deleted.`, result);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/tenant-external-vms/:id/console?width=1920&height=1080 */
  async openConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);

      const rawWidth = req.query['width'] as string | undefined;
      const rawHeight = req.query['height'] as string | undefined;
      const width = rawWidth ? parseInt(rawWidth, 10) : undefined;
      const height = rawHeight ? parseInt(rawHeight, 10) : undefined;
      const dimensions = {
        width: width && Number.isFinite(width) && width > 0 ? width : undefined,
        height: height && Number.isFinite(height) && height > 0 ? height : undefined,
      };

      const session = await externalVMService.getTenantConsoleSession(
        id,
        tenantActor(req),
        dimensions
      );
      success(res, 'External VM console session created.', session);
    } catch (err) {
      next(err);
    }
  }
}

export const tenantExternalVmController = new TenantExternalVmController();
