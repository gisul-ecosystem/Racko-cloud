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

  /** GET /api/v1/super-admin/vm-inventory/filter-options */
  async filterOptions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryService.listFilterOptions();
      success(res, 'Filter options retrieved.', data);
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

  /** GET /api/v1/super-admin/vm-inventory/series-preview */
  async seriesPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryBulkAssignService.previewSeries({
        emailPrefix: String(req.query['emailPrefix'] ?? ''),
        count: Number(req.query['count']),
        targetType: req.query['targetType'] as 'admin' | 'tenant',
        targetId: String(req.query['targetId'] ?? ''),
        projectId: String(req.query['projectId'] ?? ''),
      });
      success(res, 'Email series preview retrieved.', data);
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

  /**
   * POST /api/v1/super-admin/vm-inventory/resolve-logins
   * Matches an uploaded assignment file against the inventory. Read-only.
   */
  async resolveLogins(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryBulkAssignService.resolveLogins(req.body.rows);
      success(
        res,
        `${data.summary.resolved} of ${data.summary.total} row(s) matched a login.`,
        data
      );
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

  /**
   * POST /api/v1/super-admin/vm-inventory/servers/bulk-reset
   * Fire-and-forget: agents report progress on the machine-manager reset stream.
   */
  async bulkResetServers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryService.resetServers(req.body.serverIds);
      success(res, `Reset initiated on ${data.accepted.length} VM(s).`, data, 202);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/super-admin/vm-inventory/notification-settings */
  async getNotificationSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryService.getNotificationSettings();
      success(res, 'Notification settings retrieved.', data);
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/v1/super-admin/vm-inventory/notification-settings */
  async updateNotificationSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = await vmInventoryService.updateNotificationSettings(
        req.body.providerExpiryRecipients,
        new mongoose.Types.ObjectId(authReq.user.userId),
        req.body.warningDays
      );
      success(res, 'Notification settings saved.', data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/super-admin/vm-inventory/push-agent
   * Fire-and-forget: pushes report progress on the machine-manager push stream.
   */
  async pushAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = await vmInventoryService.pushAgent(
        req.body.serverIds,
        new mongoose.Types.ObjectId(authReq.user.userId),
        req.body.installRackoApp
      );
      const onlineNote =
        data.alreadyOnline.length > 0
          ? ` ${data.alreadyOnline.length} already had a running agent.`
          : '';
      success(
        res,
        `Agent push started on ${data.targets.length} VM(s).${onlineNote}`,
        data,
        202
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/super-admin/vm-inventory/install-software
   * Fire-and-forget: agents report progress on the machine-manager job stream.
   */
  async installSoftware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = await vmInventoryService.installSoftware(
        req.body.credentialIds,
        req.body.softwareIds,
        new mongoose.Types.ObjectId(authReq.user.userId),
        req.body.context
      );
      success(res, `Queued ${data.jobs.length} install job(s).`, data, 202);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/super-admin/vm-inventory/install-runs
   * Past install batches started by this operator, newest first.
   */
  async listInstallRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;
      const runs = await vmInventoryService.listInstallRuns(
        new mongoose.Types.ObjectId(authReq.user.userId),
        limit
      );
      success(res, 'Install runs fetched.', { runs });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/super-admin/vm-inventory/install-runs/:runId */
  async getInstallRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const run = await vmInventoryService.getInstallRun(
        new mongoose.Types.ObjectId(authReq.user.userId),
        req.params['runId']!
      );
      success(res, 'Install run fetched.', run);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/super-admin/vm-inventory/servers/bulk-override */
  async bulkSetOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryAssignmentService.bulkSetOverride(req.body);
      const skipNote =
        data.serversWithoutAssignments > 0
          ? ` ${data.serversWithoutAssignments} VM(s) had no assignment.`
          : '';
      const verb = req.body.accessOverride ? 'Granted' : 'Removed';
      success(res, `${verb} override on ${data.updated} assignment(s).${skipNote}`, data);
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
  async unassign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryAssignmentService.unassign(req.params['assignmentId']!);
      const parts = ['Login unassigned.'];
      if (data.userDeleted) parts.push('Portal user removed.');
      if (data.serverFreed) parts.push('VM returned to the free pool.');
      else if (data.remainingLogins > 0) {
        parts.push(
          `VM still has ${data.remainingLogins} assigned login(s), so it keeps its owner.`
        );
      }
      success(res, parts.join(' '), data);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/super-admin/vm-inventory/servers/bulk-unassign */
  async bulkUnassignServers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await vmInventoryAssignmentService.bulkUnassignServers(req.body.serverIds);
      success(
        res,
        `Unassigned ${data.loginsUnassigned} login(s); freed ${data.serversFreed} VM(s).`,
        data
      );
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
