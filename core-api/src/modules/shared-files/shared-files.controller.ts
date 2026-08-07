import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { sharedFilesService } from './shared-files.service';
import type { AuthenticatedRequest } from '../../types';
import type { SharedFilePermission } from '../../models/sharedFile.model';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class SharedFilesController {
  // ─── Agent: upload & share ─────────────────────────────────────────────────

  /** POST /api/v1/agent/shared-files  (multipart/form-data) */
  async agentUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'File is required.' });
        return;
      }

      const permission = (req.body['permission'] as SharedFilePermission | undefined) ?? 'read';
      const rawIds: string = req.body['sharedWithMachineIds'] ?? '';
      const sharedWithMachineIds = rawIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const result = await sharedFilesService.uploadAndShare(
        agentId,
        file.originalname,
        file.mimetype,
        file.buffer,
        permission,
        sharedWithMachineIds,
      );

      success(res, 'File uploaded and shared.', { file: result }, 201);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/agent/shared-files/inbox  — files shared WITH this machine */
  async agentListInbox(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      const files = await sharedFilesService.listForMachine(agentId);
      success(res, 'Shared files retrieved.', { files, total: files.length });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/agent/shared-files/outbox  — files uploaded BY this machine */
  async agentListOutbox(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      const files = await sharedFilesService.listByMachine(agentId);
      success(res, 'Uploaded files retrieved.', { files, total: files.length });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/agent/machines-for-app — other machines this admin owns (for VM selector) */
  async agentListMachines(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      const { MachineModel } = await import('../../modules/machine-manager/machine-manager.model');
      const self = await MachineModel.findOne({ agentId, deleted: { $ne: true } }).lean();
      if (!self) { res.status(404).json({ success: false, message: 'Agent not found.' }); return; }

      // If this machine belongs to a group, return only machines in the same group
      // Backward compatible: machines without a group return all admin machines
      let query: Record<string, unknown>;
      if (self.groupId) {
        const { MachineGroupModel } = await import('../../models/machineGroup.model');
        const group = await MachineGroupModel.findById(self.groupId).lean();
        if (group) {
          query = {
            _id: { $in: group.machineIds, $ne: self._id },
            deleted: { $ne: true },
          };
        } else {
          // Group was deleted, fall back to all admin machines
          query = { adminId: self.adminId, deleted: { $ne: true }, _id: { $ne: self._id } };
        }
      } else {
        query = { adminId: self.adminId, deleted: { $ne: true }, _id: { $ne: self._id } };
      }

      const machines = await MachineModel.find(query, { _id: 1, name: 1 }).lean();

      success(res, 'Machines retrieved.', {
        machines: machines.map((m) => ({ _id: m._id.toString(), name: m.name })),
        total: machines.length,
      });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/agent/shared-files/:id/download */
  async agentDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      const fileId  = req.params['id'] as string;

      const { stream, contentType, contentLength, fileName } =
        await sharedFilesService.getDownloadStream(fileId, agentId);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      if (contentLength !== null) res.setHeader('Content-Length', contentLength);
      res.setHeader('Cache-Control', 'no-store');

      (stream as NodeJS.ReadableStream).pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/v1/agent/shared-files/:id  — update permission / targets */
  async agentUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      const fileId  = req.params['id'] as string;

      const permission            = req.body['permission'] as SharedFilePermission | undefined;
      const sharedWithMachineIds  = req.body['sharedWithMachineIds'] as string[] | undefined;

      const result = await sharedFilesService.updateShare(
        fileId, agentId, permission, sharedWithMachineIds,
      );
      success(res, 'Share updated.', { file: result });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/agent/shared-files/:id */
  async agentDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      const fileId  = req.params['id'] as string;
      await sharedFilesService.deleteFile(fileId, agentId);
      success(res, 'File deleted.');
    } catch (err) {
      next(err);
    }
  }

  // ─── Admin portal (JWT-authenticated) ─────────────────────────────────────

  /** GET /api/v1/shared-files */
  async adminList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const files   = await sharedFilesService.listForAdmin(adminId);
      success(res, 'Shared files retrieved.', { files, total: files.length });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/shared-files/:id/download */
  async adminDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const fileId  = req.params['id'] as string;

      const { stream, contentType, contentLength, fileName } =
        await sharedFilesService.adminGetDownloadStream(fileId, adminId);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      if (contentLength !== null) res.setHeader('Content-Length', contentLength);
      res.setHeader('Cache-Control', 'no-store');

      (stream as NodeJS.ReadableStream).pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/shared-files/:id */
  async adminDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const fileId  = req.params['id'] as string;
      await sharedFilesService.adminDeleteFile(fileId, adminId);
      success(res, 'File deleted.');
    } catch (err) {
      next(err);
    }
  }
}

export const sharedFilesController = new SharedFilesController();
