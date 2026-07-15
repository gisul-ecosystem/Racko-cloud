import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { externalVMService } from './external-vm.service';
import type { AuthenticatedRequest } from '../../types';
import type {
  BulkAssignExternalPairsDto,
} from './external-vm.types';
import type { CreateExternalVMInput, BulkCreateExternalVMInput } from './external-vm.validation';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class ExternalVMController {
  /** POST /api/v1/external-vms */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const vm = await externalVMService.addExternalVM(req.body as CreateExternalVMInput, adminId);
      success(res, 'External VM added.', { externalVm: vm }, 201);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/external-vms/bulk */
  async bulkCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const { vms } = req.body as BulkCreateExternalVMInput;
      const created = await externalVMService.bulkAddExternalVMs(vms, adminId);
      success(res, 'External VMs added.', { externalVms: created, total: created.length }, 201);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/external-vms */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const vms = await externalVMService.listExternalVMs(adminId);
      success(res, 'External VMs retrieved.', { externalVms: vms, total: vms.length });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/external-vms/my-assigned */
  async getMyAssigned(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = new mongoose.Types.ObjectId(authReq.user.userId);
      const vms = await externalVMService.getMyAssignedExternalVMs(userId);
      success(res, 'Assigned servers retrieved.', { externalVms: vms, total: vms.length });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/external-vms/assign/available */
  async getAvailable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const vms = await externalVMService.getAvailableExternalVMs(adminId);
      success(res, 'Available servers retrieved.', { externalVms: vms, total: vms.length });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/external-vms/assign/counts */
  async getAssignedCounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const counts = await externalVMService.getAssignedCounts(adminId);
      success(res, 'Assignment counts retrieved.', { counts });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/external-vms/assign/user/:userId */
  async getAssignedForUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const targetUserId = new mongoose.Types.ObjectId(req.params['userId'] as string);
      const vms = await externalVMService.getAssignedExternalVMsForUser(targetUserId, adminId);
      success(res, 'Assigned servers retrieved.', { externalVms: vms, total: vms.length });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/external-vms/assign */
  async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const { userId, externalVmIds } = req.body as { userId: string; externalVmIds: string[] };
      const result = await externalVMService.assignExternalVMs(
        externalVmIds.map((id) => new mongoose.Types.ObjectId(id)),
        new mongoose.Types.ObjectId(userId),
        adminId
      );
      success(res, `${result.assigned} server(s) assigned successfully.`, result);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/external-vms/assign/bulk */
  async bulkAssignOneToOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const result = await externalVMService.bulkAssignOneToOne(
        req.body as BulkAssignExternalPairsDto,
        adminId
      );
      success(
        res,
        `${result.assigned} server(s) assigned successfully${result.failed > 0 ? `, ${result.failed} failed` : ''}.`,
        result
      );
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/external-vms/assign/:id */
  async unassign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      await externalVMService.unassignExternalVM(id, adminId);
      success(res, 'Server unassigned successfully.');
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/external-vms/:id */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const userId = new mongoose.Types.ObjectId(authReq.user.userId);
      const vm = await externalVMService.getExternalVMForActor(id, userId, authReq.user.role);
      success(res, 'External VM retrieved.', { externalVm: vm });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/external-vms/:id */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      await externalVMService.deleteExternalVM(id, adminId);
      success(res, 'External VM deleted.');
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/external-vms/:id/console */
  async openConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const userId = new mongoose.Types.ObjectId(authReq.user.userId);
      const session = await externalVMService.getConsoleSessionForActor(
        id,
        userId,
        authReq.user.role
      );
      success(res, 'External VM console session created.', session);
    } catch (err) {
      next(err);
    }
  }
}

export const externalVMController = new ExternalVMController();
