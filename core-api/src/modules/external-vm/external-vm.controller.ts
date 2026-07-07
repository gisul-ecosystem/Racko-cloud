import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { externalVMService } from './external-vm.service';
import type { AuthenticatedRequest } from '../../types';
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

  /** GET /api/v1/external-vms/:id */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const vm = await externalVMService.getExternalVM(id, adminId);
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
      const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const session = await externalVMService.getConsoleSession(id, adminId);
      success(res, 'External VM console session created.', session);
    } catch (err) {
      next(err);
    }
  }
}

export const externalVMController = new ExternalVMController();
