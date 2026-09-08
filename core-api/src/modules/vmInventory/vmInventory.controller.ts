import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../../types';
import { vmInventoryService, type ListInventoryParams } from './vmInventory.service';
import { vmInventoryAssignmentService } from './vmInventoryAssignment.service';
import { vmInventoryBulkAssignService } from './vmInventoryBulkAssign.service';
import { vmInventoryImportService } from './vmInventoryImport.service';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

class VmInventoryController {
  /** GET /api/v1/super-admin/vm-inventory */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryService.list(req.query as ListInventoryParams);
      success(res, 'Inventory retrieved.', data);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/super-admin/vm-inventory/credentials/:credentialId/password */
  async revealPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryService.revealPassword(req.params['credentialId']!);
      success(res, 'Credential revealed.', data);
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/v1/super-admin/vm-inventory/servers/:serverId */
  async updateServer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await vmInventoryService.updateServer(req.params['serverId']!, req.body);
      success(res, 'Server updated.');
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/super-admin/vm-inventory/servers/:serverId/credentials */
  async upsertCredential(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryService.upsertCredential(req.params['serverId']!, req.body);
      success(res, 'Credential saved.', data, 201);
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/v1/super-admin/vm-inventory/servers/:serverId/lock */
  async setLock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await vmInventoryService.setLock(req.params['serverId']!, req.body.inventoryLocked);
      success(res, 'Lock updated.');
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/super-admin/vm-inventory/servers/:serverId */
  async deleteServer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await vmInventoryService.deleteServer(req.params['serverId']!);
      success(res, 'Server deleted.');
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/super-admin/vm-inventory/bulk-assign */
  async bulkAssign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = await vmInventoryBulkAssignService.run({
        ...req.body,
        assignedBy: new mongoose.Types.ObjectId(authReq.user!.userId),
      });
      const message = data.dryRun
        ? `Preview: ${data.summary.ready} ready, ${data.summary.failed} blocked.`
        : `Assigned ${data.summary.assigned} login(s); ${data.summary.failed} failed.`;
      success(res, message, data);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/super-admin/vm-inventory/servers/bulk-delete */
  async bulkDeleteServers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryService.deleteServers(req.body.serverIds);
      const message =
        data.skipped.length > 0
          ? `Deleted ${data.deleted} server(s); ${data.skipped.length} skipped.`
          : `Deleted ${data.deleted} server(s).`;
      success(res, message, data);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/super-admin/vm-inventory/assignments */
  async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = await vmInventoryAssignmentService.assign({
        ...req.body,
        assignedBy: new mongoose.Types.ObjectId(authReq.user.userId),
      });
      success(res, 'Assigned.', data, 201);
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/super-admin/vm-inventory/assignments/:assignmentId */
  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await vmInventoryAssignmentService.revoke(req.params['assignmentId']!);
      success(res, 'Assignment revoked.');
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/v1/super-admin/vm-inventory/assignments/:assignmentId/override */
  async setOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await vmInventoryAssignmentService.setOverride(req.params['assignmentId']!, req.body);
      success(res, 'Override updated.');
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/super-admin/vm-inventory/map-owner */
  async mapOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await vmInventoryAssignmentService.mapOwner(req.body);
      success(res, 'Owner mapped.');
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/super-admin/vm-inventory/assignees?adminId=|tenantId= */
  async listAssignees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryAssignmentService.listAssignees({
        adminId: req.query['adminId'] as string | undefined,
        tenantId: req.query['tenantId'] as string | undefined,
      });
      success(res, 'Assignees retrieved.', data);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/super-admin/vm-inventory/projects?adminId=|tenantId= */
  async listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryAssignmentService.listAssignableProjects({
        adminId: req.query['adminId'] as string | undefined,
        tenantId: req.query['tenantId'] as string | undefined,
      });
      success(res, 'Projects retrieved.', data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/super-admin/vm-inventory/import
   * Same code path for preview and commit — `dryRun` decides whether writes land.
   */
  async importRows(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { rows, dryRun } = req.body;
      const data = await vmInventoryImportService.importRows(rows, {
        dryRun,
        createdBy: new mongoose.Types.ObjectId(authReq.user.userId),
      });
      const statusCode = dryRun ? 200 : data.summary.failed > 0 ? 207 : 201;
      success(res, dryRun ? 'Import preview generated.' : 'Import applied.', data, statusCode);
    } catch (err) {
      next(err);
    }
  }
}

export const vmInventoryController = new VmInventoryController();
