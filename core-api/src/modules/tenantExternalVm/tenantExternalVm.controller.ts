import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { externalVMService } from '../external-vm/external-vm.service';
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
      const vms = await externalVMService.getAvailableTenantExternalVMs(tenantId);
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
      const { userId, externalVmIds } = req.body as { userId: string; externalVmIds: string[] };
      const result = await externalVMService.assignTenantExternalVMs(
        externalVmIds.map((id) => new mongoose.Types.ObjectId(id)),
        new mongoose.Types.ObjectId(userId),
        tenantId,
        tenantUserId
      );
      success(res, `${result.assigned} server(s) assigned successfully.`, result);
    } catch (err) {
      next(err);
    }
  }

  async bulkAssignOneToOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, tenantUserId } = tenantIds(req);
      const result = await externalVMService.bulkAssignTenantOneToOne(
        req.body as TenantBulkAssignExternalPairsDto,
        tenantId,
        tenantUserId
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

  async unassign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = tenantIds(req);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      await externalVMService.unassignTenantExternalVM(id, tenantId);
      success(res, 'Server unassigned successfully.');
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
