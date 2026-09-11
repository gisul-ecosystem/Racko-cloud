import mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { TenantUser } from '../../models/tenantUser.model';
import { ForbiddenError } from '../../utils/errors';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { tenantSupportService } from './tenantSupport.service';
import type { TicketStatus } from './support.model';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

async function getTenantContext(req: Request): Promise<{
  tenantId: string;
  tenantUserId: string;
  tenantUserName: string;
  tenantUserEmail: string;
  isTenantAdmin: boolean;
}> {
  const authReq = req as TenantAuthenticatedRequest;
  const tenantUser = authReq.tenantUser;

  if (!tenantUser?.tenantId || !tenantUser.id || !tenantUser.role) {
    throw new ForbiddenError('Tenant authentication required.');
  }

  const profile = await TenantUser.findOne({
    _id: new mongoose.Types.ObjectId(tenantUser.id),
    tenantId: new mongoose.Types.ObjectId(tenantUser.tenantId),
  })
    .select('email username')
    .lean();

  if (!profile) {
    throw new ForbiddenError('Tenant user not found.');
  }

  return {
    tenantId: tenantUser.tenantId,
    tenantUserId: tenantUser.id,
    tenantUserName: profile.username?.trim() || profile.email,
    tenantUserEmail: profile.email,
    isTenantAdmin: tenantUser.role === 'tenant_admin',
  };
}

export class TenantSupportController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = await getTenantContext(req);
      const ticket = await tenantSupportService.createTicket(
        ctx.tenantId,
        ctx.tenantUserId,
        ctx.tenantUserName,
        ctx.tenantUserEmail,
        req.body.requesterPhone as string | undefined,
        req.body
      );
      success(res, 'Ticket submitted successfully.', { ticket }, 201);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = await getTenantContext(req);
      const status = req.query['status'] as TicketStatus | undefined;
      const projectId = req.query['projectId'] as string | undefined;
      const skip = req.query['skip'] as string | undefined;
      const limit = req.query['limit'] as string | undefined;

      const tickets = await tenantSupportService.listForTenant(
        ctx.tenantId,
        ctx.tenantUserId,
        ctx.isTenantAdmin,
        {
          status,
          projectId,
          skip: Number(skip ?? 0),
          limit: Number(limit ?? 50),
        }
      );
      success(res, 'Tickets retrieved.', { tickets });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = await getTenantContext(req);
      const ticketId = req.params['ticketId'] as string;
      const ticket = await tenantSupportService.getOne(ctx.tenantId, ticketId);
      success(res, 'Ticket retrieved.', { ticket });
    } catch (error) {
      next(error);
    }
  }

  async assignToSelf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = await getTenantContext(req);
      const ticket = await tenantSupportService.assignToSelf(
        ctx.tenantId,
        req.params['ticketId'] as string,
        ctx.tenantUserId,
        ctx.tenantUserName
      );
      success(res, 'Ticket assigned to you.', { ticket });
    } catch (error) {
      next(error);
    }
  }

  async resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = await getTenantContext(req);
      const ticket = await tenantSupportService.resolveAsTenant(
        ctx.tenantId,
        req.params['ticketId'] as string,
        ctx.tenantUserId
      );
      success(res, 'Ticket resolved.', { ticket });
    } catch (error) {
      next(error);
    }
  }

  async escalate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = await getTenantContext(req);
      const ticket = await tenantSupportService.escalateToPlatform(
        ctx.tenantId,
        req.params['ticketId'] as string,
        ctx.tenantUserId,
        ctx.tenantUserName,
        req.body.note as string | undefined
      );
      success(res, 'Ticket escalated to platform team.', { ticket });
    } catch (error) {
      next(error);
    }
  }

  async addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = await getTenantContext(req);
      const role = ctx.isTenantAdmin ? 'tenant_admin' : 'user';
      const { body, isInternal } = req.body as { body: string; isInternal?: boolean };

      const ticket = await tenantSupportService.addComment(
        ctx.tenantId,
        req.params['ticketId'] as string,
        ctx.tenantUserId,
        ctx.tenantUserName,
        role,
        body,
        isInternal ?? false
      );
      success(res, 'Comment added.', { ticket });
    } catch (error) {
      next(error);
    }
  }
}

export const tenantSupportController = new TenantSupportController();
