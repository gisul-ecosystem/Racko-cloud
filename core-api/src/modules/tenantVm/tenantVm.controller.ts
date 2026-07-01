import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { tenantVmService } from './tenantVm.service';
import type { TenantOnboardDto, TenantVmActor, TenantVmListFilters } from './tenantVm.types';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

function actorFromRequest(req: Request): TenantVmActor {
  const authReq = req as TenantAuthenticatedRequest;
  return {
    id: authReq.tenantUser.id,
    tenantId: authReq.tenantUser.tenantId,
    role: authReq.tenantUser.role,
  };
}

export class TenantVmController {
  async listVms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as { status?: string; node?: string };
      const filters: TenantVmListFilters = {};
      if (query.status) filters.status = query.status;
      if (query.node) filters.node = query.node;

      const vms = await tenantVmService.listVms(actorFromRequest(req), filters);
      success(res, 'Tenant VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }

  async listVmsForSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const query = req.query as { status?: string; node?: string };
      const filters: TenantVmListFilters = {};
      if (query.status) filters.status = query.status;
      if (query.node) filters.node = query.node;

      const vms = await tenantVmService.listVmsForSuperAdmin(
        new mongoose.Types.ObjectId(tenantId),
        filters
      );
      success(res, 'Tenant VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }

  async getVmDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { vmId } = req.params as { vmId: string };
      const details = await tenantVmService.getVmDetails(actorFromRequest(req), vmId, req);
      success(res, 'Tenant VM details retrieved.', details);
    } catch (error) {
      next(error);
    }
  }

  async getVmStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { vmId } = req.params as { vmId: string };
      const status = await tenantVmService.getVmStatus(actorFromRequest(req), vmId, req);
      success(res, 'Tenant VM status retrieved.', { status });
    } catch (error) {
      next(error);
    }
  }

  async startVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { vmId } = req.params as { vmId: string };
      const result = await tenantVmService.startVm(actorFromRequest(req), vmId, req);
      success(res, 'Tenant VM started successfully.', { result });
    } catch (error) {
      next(error);
    }
  }

  async stopVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { vmId } = req.params as { vmId: string };
      const result = await tenantVmService.stopVm(actorFromRequest(req), vmId, req);
      success(res, 'Tenant VM stopped successfully.', { result });
    } catch (error) {
      next(error);
    }
  }

  async restartVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { vmId } = req.params as { vmId: string };
      const result = await tenantVmService.restartVm(actorFromRequest(req), vmId, req);
      success(res, 'Tenant VM restarted successfully.', { result });
    } catch (error) {
      next(error);
    }
  }

  async openConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { vmId } = req.params as { vmId: string };
      const protocol = (req.query['protocol'] as 'rdp' | 'ssh' | 'vnc' | undefined);
      const consoleSession = await tenantVmService.openConsole(actorFromRequest(req), vmId, req, protocol);
      success(res, 'Console session ready.', consoleSession);
    } catch (error) {
      next(error);
    }
  }

  async getAvailableVms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const vms = await tenantVmService.getAvailableVms(tenantId);
      success(res, 'Available tenant VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }

  async getAssignedVmCounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const counts = await tenantVmService.getAssignedVmCounts(tenantId);
      success(res, 'Assigned tenant VM counts retrieved.', { counts });
    } catch (error) {
      next(error);
    }
  }

  async getAssignedVmsForUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const createdBy = new mongoose.Types.ObjectId(authReq.tenantUser.id);
      const { userId } = req.params as { userId: string };
      const vms = await tenantVmService.getAssignedVmsForUser(
        new mongoose.Types.ObjectId(userId),
        tenantId,
        createdBy
      );
      success(res, 'Assigned tenant VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }

  async onboardVms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const createdBy = new mongoose.Types.ObjectId(authReq.tenantUser.id);
      const dto = req.body as TenantOnboardDto;

      const result = await tenantVmService.onboardVms(dto, tenantId, createdBy);
      const noun = dto.vmIds.length === 1 ? 'VM' : 'VMs';
      success(
        res,
        `Tenant onboard complete. ${result.assigned} ${noun} assigned${result.failed > 0 ? `, ${result.failed} failed` : ''}.`,
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  async unassignVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as TenantAuthenticatedRequest;
      const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
      const { vmId } = req.params as { vmId: string };
      await tenantVmService.unassignVm(new mongoose.Types.ObjectId(vmId), tenantId);
      success(res, 'Tenant VM unassigned.');
    } catch (error) {
      next(error);
    }
  }
}

export const tenantVmController = new TenantVmController();
