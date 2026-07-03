import type { Request, Response, NextFunction } from 'express';
import { adminVmTemplateService } from './adminVmTemplate.service';
import { AdminVmTemplate } from './adminVmTemplate.model';
import { templateBuildEmitter, type TemplateBuildEvent } from './adminVmTemplate.events';
import {
  issueStreamTicket as createStreamTicket,
  consumeStreamTicket,
} from './adminVmTemplate.streamTicket';
import { logger } from '../../utils/logger';
import type { AuthenticatedRequest } from '../../types';
import { ValidationError, ForbiddenError, NotFoundError } from '../../utils/errors';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class AdminVmTemplateController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const templates = await adminVmTemplateService.list(authReq.user.userId);
      success(res, 'Templates retrieved.', { templates });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { sourceVmId, name } = req.body as { sourceVmId?: string; name?: string };

      if (!sourceVmId || typeof sourceVmId !== 'string') {
        throw new ValidationError('sourceVmId is required.');
      }
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('name is required.');
      }
      if (name.trim().length > 120) {
        throw new ValidationError('name must be 120 characters or fewer.');
      }

      const template = await adminVmTemplateService.create(
        authReq.user.userId,
        sourceVmId,
        name
      );
      success(res, 'Template creation started.', { template }, 201);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { templateId } = req.params as { templateId: string };

      if (!templateId || !/^[a-f\d]{24}$/i.test(templateId)) {
        throw new ValidationError('Invalid template ID.');
      }

      await adminVmTemplateService.delete(authReq.user.userId, templateId);
      success(res, 'Template deleted.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin-vm-templates/:templateId/stream-ticket
   * Issues a short-lived, single-use token scoped to opening one SSE stream.
   * Normal Bearer auth — access token never appears in the EventSource URL.
   */
  async issueStreamTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { templateId } = req.params as { templateId: string };

      if (!templateId || !/^[a-f\d]{24}$/i.test(templateId)) {
        throw new ValidationError('Invalid template ID.');
      }

      const doc = await AdminVmTemplate.findById(templateId).lean();
      if (!doc) {
        throw new NotFoundError('Template not found.');
      }
      if (doc.adminId.toString() !== authReq.user.userId && authReq.user.role !== 'super_admin') {
        throw new ForbiddenError('Forbidden.');
      }

      const ticket = createStreamTicket(templateId, authReq.user.userId, authReq.user.role);
      success(res, 'Stream ticket issued.', ticket);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin-vm-templates/:templateId/stream
   * SSE endpoint — pushes build progress events in real time.
   * Auth via ?streamToken= query param (single-use ticket from stream-ticket endpoint).
   * Sends the current DB state immediately on connect, then streams live updates.
   * Closes automatically when the build reaches a terminal state (ready/failed).
   */
  async streamProgress(req: Request, res: Response): Promise<void> {
    const { templateId } = req.params as { templateId: string };

    logger.info('[SSE][Stream] Connection attempt', { templateId, url: req.url });

    if (!templateId || !/^[a-f\d]{24}$/i.test(templateId)) {
      logger.warn('[SSE][Stream] Invalid templateId', { templateId });
      res.status(400).json({ success: false, message: 'Invalid template ID.' });
      return;
    }

    const rawToken = req.query['streamToken'];
    const streamToken = typeof rawToken === 'string' ? rawToken : '';
    const ticket = streamToken ? consumeStreamTicket(streamToken, templateId) : null;

    if (!ticket) {
      logger.warn('[SSE][Stream] Auth failed — invalid or missing stream ticket', {
        templateId,
        streamTokenPresent: !!streamToken,
      });
      res.status(401).json({ success: false, message: 'Unauthorized.' });
      return;
    }

    const doc = await AdminVmTemplate.findById(templateId).lean();
    if (!doc) {
      logger.warn('[SSE][Stream] Template not found', { templateId });
      res.status(404).json({ success: false, message: 'Template not found.' });
      return;
    }
    if (doc.adminId.toString() !== ticket.userId && ticket.role !== 'super_admin') {
      logger.warn('[SSE][Stream] Ownership check failed', { templateId, userId: ticket.userId });
      res.status(403).json({ success: false, message: 'Forbidden.' });
      return;
    }

    logger.info('[SSE][Stream] Auth passed, opening stream', {
      templateId,
      userId: ticket.userId,
      currentStatus: doc.status,
      currentBuildStep: doc.buildStep,
    });

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx/proxy buffering
    res.flushHeaders();
    logger.info('[SSE][Stream] Headers flushed', { templateId });

    const send = (event: TemplateBuildEvent) => {
      const payload = JSON.stringify(event);
      logger.info('[SSE][Stream] Writing event to client', { templateId, event });
      res.write(`data: ${payload}\n\n`);
    };

    // Send current state immediately so client doesn't wait for the next step event
    send({
      buildStep: doc.buildStep ?? null,
      status: doc.status as 'creating' | 'ready' | 'failed',
      errorMessage: doc.errorMessage ?? undefined,
    });

    // If already terminal, close immediately — no need to subscribe
    if (doc.status === 'ready' || doc.status === 'failed') {
      logger.info('[SSE][Stream] Already terminal, closing immediately', { templateId, status: doc.status });
      res.end();
      return;
    }

    // Subscribe to live step events
    const listener = (event: TemplateBuildEvent) => {
      logger.info('[SSE][Stream] Listener received event, forwarding to client', { templateId, event });
      send(event);
      if (event.status === 'ready' || event.status === 'failed') {
        templateBuildEmitter.removeListener(templateId, listener);
        logger.info('[SSE][Stream] Terminal event sent, closing stream', { templateId });
        res.end();
      }
    };

    templateBuildEmitter.on(templateId, listener);
    logger.info('[SSE][Stream] Listener registered', {
      templateId,
      totalListeners: templateBuildEmitter.listenerCount(templateId),
    });

    // Clean up listener if client disconnects early (browser tab closed, navigation, etc.)
    req.on('close', () => {
      logger.info('[SSE][Stream] Client disconnected, cleaning up listener', { templateId });
      templateBuildEmitter.removeListener(templateId, listener);
    });
  }
}

export const adminVmTemplateController = new AdminVmTemplateController();
