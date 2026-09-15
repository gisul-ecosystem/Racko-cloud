import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../../types';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { vmController } from '../vm/vm.controller';
import { vmService } from '../vm/vm.service';
import { tenantVmService } from '../tenantVm/tenantVm.service';
import type { TenantOnboardDto, TenantVmActor, TenantVmListFilters } from '../tenantVm/tenantVm.types';
import type { VMFilters } from '../vm/vm.types';
import type { AccessScheduleInput } from '../vmAccessSchedule/accessScheduleParse';
import { VM } from '../vm/vm.model';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { ApiAccessAuthenticatedRequest } from './requireApiAccessToken.middleware';
import { sendPublicSuccess } from './publicApi.envelope';
import {
  publicVmDetailFromPlatform,
  publicVmDetailFromTenant,
  publicVmFromMongoLean,
  publicVmFromTenantSummary,
  publicVmLiveStatusFromVmStatus,
  serializePublicJobPayload,
} from './publicVm.serializer';
import { resolvePlatformAssignUserId } from './publicAssignUser.service';
import { publicTemplateFromProxmox } from './publicTemplate.serializer';

function tenantActor(req: Request): TenantVmActor {
  const authReq = req as TenantAuthenticatedRequest;
  return {
    id: authReq.tenantUser.id,
    tenantId: authReq.tenantUser.tenantId,
    role: authReq.tenantUser.role,
  };
}

function platformAdminObjectId(req: Request): mongoose.Types.ObjectId {
  const authReq = req as AuthenticatedRequest;
  return new mongoose.Types.ObjectId(authReq.user.userId);
}

function applyPlatformAdminContext(req: Request, adminId: mongoose.Types.ObjectId): void {
  const authReq = req as AuthenticatedRequest;
  const adminStr = adminId.toString();
  authReq.user = {
    userId: adminStr,
    role: 'admin',
    sessionId: authReq.user?.sessionId ?? 'api:public',
  };
  req.headers['x-user-id'] = adminStr;
  req.headers['x-user-role'] = 'admin';
}

async function assertTenantJobAccess(
  tenantId: mongoose.Types.ObjectId,
  jobId: mongoose.Types.ObjectId,
  adminId: mongoose.Types.ObjectId,
  req: Request
) {
  applyPlatformAdminContext(req, adminId);
  const { job, vms } = await vmService.getJobStatus(jobId, adminId, req);

  if (job.vmIds.length > 0) {
    const owned = await VM.countDocuments({
      _id: { $in: job.vmIds },
      tenantId,
    });
    if (owned !== job.vmIds.length) {
      throw new NotFoundError('Job not found.');
    }
  }

  return { job, vms };
}

export class PublicVmsController {
  async listVms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiReq = req as ApiAccessAuthenticatedRequest;
      const query = req.query as { status?: string; node?: string; cloneType?: string };

      if (apiReq.apiAccess.ownerType === 'tenant') {
        const filters: TenantVmListFilters = {};
        if (query.status) filters.status = query.status;
        if (query.node) filters.node = query.node;
        const vms = await tenantVmService.listVms(tenantActor(req), filters);
        sendPublicSuccess(res, {
          vms: vms.map(publicVmFromTenantSummary),
          total: vms.length,
        });
        return;
      }

      const adminId = platformAdminObjectId(req);
      const filters: VMFilters = {};
      if (query.status) filters.status = query.status;
      if (query.node) filters.node = query.node;
      if (query.cloneType) filters.cloneType = query.cloneType as VMFilters['cloneType'];

      const vms = await vmService.getMyVMs(adminId, filters);
      sendPublicSuccess(res, {
        vms: vms.map(publicVmFromMongoLean),
        total: vms.length,
      });
    } catch (error) {
      next(error);
    }
  }

  async createVms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiReq = req as ApiAccessAuthenticatedRequest;

      if (apiReq.apiAccess.ownerType === 'tenant') {
        throw new ValidationError(
          'VM creation via the public API is only supported for platform credentials.'
        );
      }

      await new Promise<void>((resolve, reject) => {
        let statusCode = 202;
        const captureRes = {
          status(code: number) {
            statusCode = code;
            return captureRes;
          },
          json(body: { success?: boolean; message?: string; data?: { jobId: string } }) {
            if (body.success && body.data?.jobId) {
              sendPublicSuccess(res, { jobId: body.data.jobId }, statusCode);
              resolve();
              return;
            }
            reject(new ValidationError(body.message ?? 'VM creation failed.'));
          },
        } as unknown as Response;

        void vmController.createVM(req, captureRes, (err?: unknown) => {
          if (err) reject(err);
        });
      });
    } catch (error) {
      next(error);
    }
  }

  async getVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiReq = req as ApiAccessAuthenticatedRequest;
      const vmId = req.params['id'] as string;

      if (apiReq.apiAccess.ownerType === 'tenant') {
        const details = await tenantVmService.getVmDetails(tenantActor(req), vmId, req);
        sendPublicSuccess(res, publicVmDetailFromTenant(details));
        return;
      }

      const adminId = platformAdminObjectId(req);
      const objectId = new mongoose.Types.ObjectId(vmId);
      const details = await vmService.getVMDetails(objectId, adminId, req);
      const leanVm = await VM.findById(objectId).lean();
      if (!leanVm) {
        throw new NotFoundError('VM not found.');
      }
      sendPublicSuccess(res, publicVmDetailFromPlatform(leanVm, details.liveStatus));
    } catch (error) {
      next(error);
    }
  }

  async deleteVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiReq = req as ApiAccessAuthenticatedRequest;
      const vmId = req.params['id'] as string;

      if (apiReq.apiAccess.ownerType === 'tenant') {
        await tenantVmService.deleteVm(tenantActor(req), vmId, req);
      } else {
        await vmService.deleteVM(
          new mongoose.Types.ObjectId(vmId),
          platformAdminObjectId(req),
          req
        );
      }

      sendPublicSuccess(res, { deleted: true });
    } catch (error) {
      next(error);
    }
  }

  async startVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.runPowerAction(req, res, 'start');
    } catch (error) {
      next(error);
    }
  }

  async stopVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.runPowerAction(req, res, 'stop');
    } catch (error) {
      next(error);
    }
  }

  async restartVm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.runPowerAction(req, res, 'restart');
    } catch (error) {
      next(error);
    }
  }

  private async runPowerAction(
    req: Request,
    res: Response,
    action: 'start' | 'stop' | 'restart'
  ): Promise<void> {
    const apiReq = req as ApiAccessAuthenticatedRequest;
    const vmId = req.params['id'] as string;

    if (apiReq.apiAccess.ownerType === 'tenant') {
      const actor = tenantActor(req);
      const payload =
        action === 'start'
          ? await tenantVmService.acceptPublicStartVm(actor, vmId, req)
          : action === 'stop'
            ? await tenantVmService.acceptPublicStopVm(actor, vmId, req)
            : await tenantVmService.acceptPublicRestartVm(actor, vmId, req);
      sendPublicSuccess(res, payload, 202);
      return;
    }

    const id = new mongoose.Types.ObjectId(vmId);
    const adminId = platformAdminObjectId(req);
    const payload =
      action === 'start'
        ? await vmService.acceptPublicStartVM(id, adminId, req)
        : action === 'stop'
          ? await vmService.acceptPublicStopVM(id, adminId, req)
          : await vmService.acceptPublicRestartVM(id, adminId, req);
    sendPublicSuccess(res, payload, 202);
  }

  async getVmStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiReq = req as ApiAccessAuthenticatedRequest;
      const vmId = req.params['id'] as string;

      if (apiReq.apiAccess.ownerType === 'tenant') {
        const status = await tenantVmService.getVmStatus(tenantActor(req), vmId, req);
        sendPublicSuccess(res, {
          status: publicVmLiveStatusFromVmStatus(status),
        });
        return;
      }

      const status = await vmService.getVMStatus(
        new mongoose.Types.ObjectId(vmId),
        platformAdminObjectId(req),
        req
      );
      sendPublicSuccess(res, { status: publicVmLiveStatusFromVmStatus(status) });
    } catch (error) {
      next(error);
    }
  }

  async getConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiReq = req as ApiAccessAuthenticatedRequest;
      const vmId = req.params['id'] as string;
      const protocol = req.query['protocol'] as 'rdp' | 'ssh' | 'vnc' | undefined;
      const rawWidth = req.query['width'] as string | undefined;
      const rawHeight = req.query['height'] as string | undefined;
      const width = rawWidth ? parseInt(rawWidth, 10) : undefined;
      const height = rawHeight ? parseInt(rawHeight, 10) : undefined;
      const dimensions = {
        width: width && Number.isFinite(width) && width > 0 ? width : undefined,
        height: height && Number.isFinite(height) && height > 0 ? height : undefined,
      };

      if (apiReq.apiAccess.ownerType === 'tenant') {
        const session = await tenantVmService.openConsole(
          tenantActor(req),
          vmId,
          req,
          protocol,
          dimensions
        );
        sendPublicSuccess(res, session);
        return;
      }

      const session = await vmService.openConsole(
        new mongoose.Types.ObjectId(vmId),
        platformAdminObjectId(req),
        req,
        protocol,
        dimensions
      );
      sendPublicSuccess(res, session);
    } catch (error) {
      next(error);
    }
  }

  async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiReq = req as ApiAccessAuthenticatedRequest;

      if (apiReq.apiAccess.ownerType === 'tenant') {
        const authReq = req as TenantAuthenticatedRequest;
        const tenantId = new mongoose.Types.ObjectId(authReq.tenantUser.tenantId);
        const createdBy = new mongoose.Types.ObjectId(authReq.tenantUser.id);
        const dto = req.body as TenantOnboardDto;
        const result = await tenantVmService.onboardVms(dto, tenantId, createdBy);
        sendPublicSuccess(res, result, 201);
        return;
      }

      const adminId = platformAdminObjectId(req);
      const body = req.body as {
        userId?: string;
        userEmail?: string;
        username?: string;
        vmIds: string[];
        accessSchedule?: AccessScheduleInput;
      };
      const targetUserId = await resolvePlatformAssignUserId(adminId, {
        userId: body.userId,
        userEmail: body.userEmail,
        username: body.username,
      });
      const result = await vmService.assignVMs(
        body.vmIds.map((id) => new mongoose.Types.ObjectId(id)),
        targetUserId,
        adminId,
        body.accessSchedule
      );
      sendPublicSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiReq = req as ApiAccessAuthenticatedRequest;

      if (apiReq.apiAccess.ownerType === 'tenant') {
        const tenantId = new mongoose.Types.ObjectId(apiReq.apiAccess.tenantId!);
        const adminId = await tenantVmService.resolveProvisioningAdminId(tenantId);
        applyPlatformAdminContext(req, adminId);
      }

      const templates = await vmService.getTemplates(req);
      sendPublicSuccess(res, {
        templates: templates.map(publicTemplateFromProxmox),
        total: templates.length,
      });
    } catch (error) {
      next(error);
    }
  }

  async getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiReq = req as ApiAccessAuthenticatedRequest;
      const jobId = new mongoose.Types.ObjectId(req.params['id'] as string);

      if (apiReq.apiAccess.ownerType === 'tenant') {
        const tenantId = new mongoose.Types.ObjectId(apiReq.apiAccess.tenantId!);
        const adminId = await tenantVmService.resolveProvisioningAdminId(tenantId);
        const payload = await assertTenantJobAccess(tenantId, jobId, adminId, req);
        sendPublicSuccess(res, serializePublicJobPayload(payload));
        return;
      }

      const adminId = platformAdminObjectId(req);
      const payload = await vmService.getJobStatus(jobId, adminId, req);
      sendPublicSuccess(res, serializePublicJobPayload(payload));
    } catch (error) {
      next(error);
    }
  }
}

export const publicVmsController = new PublicVmsController();
