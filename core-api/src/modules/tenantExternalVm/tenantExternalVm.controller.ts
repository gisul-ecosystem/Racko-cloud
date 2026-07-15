import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { externalVMService } from '../external-vm/external-vm.service';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import type {
  CreateExternalVMInput,
  BulkCreateExternalVMInput,
} from '../external-vm/external-vm.validation';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
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
      const { tenantId } = tenantIds(req);
      const vms = await externalVMService.listTenantExternalVMs(tenantId);
      success(res, 'External VMs retrieved.', { externalVms: vms, total: vms.length });
    } catch (err) {
      next(err);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = tenantIds(req);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const vm = await externalVMService.getTenantExternalVM(id, tenantId);
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

  async openConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = tenantIds(req);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const session = await externalVMService.getTenantConsoleSession(id, tenantId);
      success(res, 'External VM console session created.', session);
    } catch (err) {
      next(err);
    }
  }
}

export const tenantExternalVmController = new TenantExternalVmController();
