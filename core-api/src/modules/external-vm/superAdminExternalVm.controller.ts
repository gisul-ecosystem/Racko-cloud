import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../../types';
import { superAdminBulkImportService } from './superAdminBulkImport.service';
import { superAdminExternalVmOverviewService } from './superAdminExternalVmOverview.service';
import { superAdminExternalVmAssignmentService } from './superAdminExternalVmAssignment.service';
import { superAdminExternalVmDeleteService } from './superAdminExternalVmDelete.service';
import type { SuperAdminBulkImportExternalVmInput } from './superAdminBulkImport.validation';
import type {
  CreateSuperAdminExternalVmAssignmentInput,
  PatchSuperAdminExternalVmAssignmentInput,
} from './superAdminExternalVmAssignment.validation';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class SuperAdminExternalVmController {
  /** POST /api/v1/super-admin/external-vms/bulk-import */
  async bulkImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const superAdminUserId = new mongoose.Types.ObjectId(authReq.user.userId);
      const body = req.body as SuperAdminBulkImportExternalVmInput;
      const result = await superAdminBulkImportService.bulkImportAndAssign(body, superAdminUserId);

      const statusCode = result.summary.failed === 0 ? 201 : result.summary.succeeded > 0 ? 207 : 400;
      success(
        res,
        result.summary.failed === 0
          ? 'External VMs imported.'
          : result.summary.succeeded > 0
            ? 'External VMs imported with partial failures.'
            : 'External VM bulk import failed.',
        result,
        statusCode
      );
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/super-admin/external-vms/overview */
  async overview(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await superAdminExternalVmOverviewService.getOverview();
      success(res, 'External VM overview retrieved.', data);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/super-admin/external-vms/assignees?adminId=|tenantId= */
  async listAssignees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId =
        typeof req.query['adminId'] === 'string' ? req.query['adminId'] : undefined;
      const tenantId =
        typeof req.query['tenantId'] === 'string' ? req.query['tenantId'] : undefined;
      const data = await superAdminExternalVmOverviewService.listAssigneeOptions({
        adminId,
        tenantId,
      });
      success(res, 'Assignees retrieved.', data);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/super-admin/external-vms/targets */
  async listTargets(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await superAdminExternalVmOverviewService.listTargetOptions();
      success(res, 'Targets retrieved.', data);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/super-admin/external-vms/:id/assignments */
  async createAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const assignedBy = new mongoose.Types.ObjectId(authReq.user.userId);
      const input: CreateSuperAdminExternalVmAssignmentInput = {
        params: { id: req.params.id! },
        body: req.body,
      };
      const row = await superAdminExternalVmAssignmentService.createAssignment(input, assignedBy);
      success(res, 'Assignment created.', { row }, 201);
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/v1/super-admin/external-vms/:id/assignments/:assignmentId */
  async patchAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: PatchSuperAdminExternalVmAssignmentInput = {
        params: { id: req.params.id!, assignmentId: req.params.assignmentId! },
        body: req.body,
      };
      const row = await superAdminExternalVmAssignmentService.patchAssignment(input);
      success(res, 'Assignment updated.', { row });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/super-admin/external-vms/:id/assignments/:assignmentId */
  async deleteAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const row = await superAdminExternalVmAssignmentService.deleteAssignment(
        req.params.id!,
        req.params.assignmentId!
      );
      success(res, 'Assignment removed.', { row });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/super-admin/external-vms/:id */
  async deleteExternalVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await superAdminExternalVmDeleteService.deleteOne(req.params.id!);
      if (!result.success) {
        res.status(result.error?.includes('not found') ? 404 : 400).json({
          success: false,
          message: result.error ?? 'Delete failed.',
          data: { results: [result], summary: { total: 1, deleted: 0, failed: 1 } },
        });
        return;
      }
      success(res, 'External VM deleted.', {
        results: [result],
        summary: { total: 1, deleted: 1, failed: 0 },
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/super-admin/external-vms/bulk-delete */
  async bulkDeleteExternalVms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ids = (req.body as { ids: string[] }).ids;
      const data = await superAdminExternalVmDeleteService.bulkDelete(ids);
      const statusCode =
        data.summary.failed === 0 ? 200 : data.summary.deleted > 0 ? 207 : 400;
      success(
        res,
        data.summary.failed === 0
          ? 'External VMs deleted.'
          : data.summary.deleted > 0
            ? 'External VMs deleted with partial failures.'
            : 'External VM bulk delete failed.',
        data,
        statusCode
      );
    } catch (err) {
      next(err);
    }
  }
}

export const superAdminExternalVmController = new SuperAdminExternalVmController();
