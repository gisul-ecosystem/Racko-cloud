import type { Request, Response, NextFunction } from 'express';
import { User } from '../../models/user.model';
import { supportService, normalizePlatformCommentAuthorRole } from './support.service';
import type { TicketStatus } from './support.model';
import type { AuthenticatedRequest } from '../../types';
import { ForbiddenError } from '../../utils/errors';

const ROLE_ALLOWED_STATUSES: Record<string, TicketStatus[]> = {
  support_agent: ['open', 'in_progress', 'resolved'],
  super_admin: ['open', 'in_progress', 'platform_assigned', 'resolved', 'closed'],
  admin: ['open', 'in_progress', 'resolved', 'closed'],
};

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class SupportController {
  async listAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query['status'] as TicketStatus | undefined;
      const type = req.query['type'] as 'support' | 'bug' | 'vm_request' | undefined;
      const priority = req.query['priority'] as
        | 'low'
        | 'medium'
        | 'high'
        | 'critical'
        | undefined;
      const assigneeId = req.query['assigneeId'] as string | undefined;
      const tenantId = req.query['tenantId'] as string | undefined;
      const skip = req.query['skip'] ? Number(req.query['skip']) : undefined;
      const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;

      const tickets = await supportService.listAll({
        status,
        type,
        priority,
        assigneeId,
        tenantId,
        skip,
        limit,
      });
      success(res, 'Tickets retrieved.', { tickets });
    } catch (error) {
      next(error);
    }
  }

  async myTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const agentId = authReq.user.userId;
      const status = req.query['status'] as TicketStatus | undefined;
      const skip = req.query['skip'] ? Number(req.query['skip']) : 0;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 50;

      const tickets = await supportService.myTickets(agentId, status, skip, limit);
      success(res, 'Your tickets retrieved.', { tickets });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticketId = req.params['ticketId'] as string;
      const ticket = await supportService.getOne(ticketId);
      success(res, 'Ticket retrieved.', { ticket });
    } catch (error) {
      next(error);
    }
  }

  async updateTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const ticketId = req.params['ticketId'] as string;
      const agentId = authReq.user.userId;
      const payload = req.body as {
        status?: TicketStatus;
        priority?: 'low' | 'medium' | 'high' | 'critical';
        platformAssigneeId?: string;
        platformAssigneeName?: string;
      };

      if (payload.status !== undefined) {
        const allowedStatuses = ROLE_ALLOWED_STATUSES[authReq.user.role] ?? [];
        if (!allowedStatuses.includes(payload.status)) {
          throw new ForbiddenError('You cannot set this status.');
        }
      }

      const ticket = await supportService.updateTicket(ticketId, agentId, payload);
      success(res, 'Ticket updated.', { ticket });
    } catch (error) {
      next(error);
    }
  }

  async reassign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const ticketId = req.params['ticketId'] as string;
      const agentId = req.body.agentId as string;
      const adminId = authReq.user.userId;

      const ticket = await supportService.reassign(ticketId, agentId, adminId);
      success(res, 'Ticket reassigned.', { ticket });
    } catch (error) {
      next(error);
    }
  }

  async addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const ticketId = req.params['ticketId'] as string;
      const authorId = authReq.user.userId;
      const authorName =
        (authReq.user as { name?: string; email?: string }).name ??
        (authReq.user as { name?: string; email?: string }).email ??
        authorId;
      const role = normalizePlatformCommentAuthorRole(authReq.user.role);
      const { body, isInternal } = req.body as { body: string; isInternal?: boolean };

      const ticket = await supportService.addComment(
        ticketId,
        authorId,
        authorName,
        role,
        body,
        isInternal ?? false
      );
      success(res, 'Comment added.', { ticket });
    } catch (error) {
      next(error);
    }
  }

  async queueOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const queue = await supportService.queueOverview();
      success(res, 'Queue overview retrieved.', { queue });
    } catch (error) {
      next(error);
    }
  }

  async listAgents(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agents = await User.find({ role: 'support_agent' })
        .select('_id name email isActive createdAt')
        .sort({ createdAt: -1 })
        .lean();
      success(res, 'Agents retrieved.', { agents });
    } catch (error) {
      next(error);
    }
  }

  async createAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { name, email, password } = req.body as {
        name: string;
        email: string;
        password: string;
      };
      const agent = await supportService.createAgent({ name, email, password }, authReq.user.userId);
      success(res, 'Support agent created.', { agent }, 201);
    } catch (error) {
      next(error);
    }
  }
}

export const supportController = new SupportController();
