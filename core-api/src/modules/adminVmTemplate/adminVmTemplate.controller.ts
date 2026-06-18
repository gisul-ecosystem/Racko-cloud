import type { Request, Response, NextFunction } from 'express';
import { adminVmTemplateService } from './adminVmTemplate.service';
import type { AuthenticatedRequest } from '../../types';
import { ValidationError } from '../../utils/errors';

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
}

export const adminVmTemplateController = new AdminVmTemplateController();
