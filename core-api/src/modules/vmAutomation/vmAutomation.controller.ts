import type { Request, Response, NextFunction } from 'express';
import { vmAutomationService } from './vmAutomation.service';
import type { AuthenticatedRequest } from '../../types';
import type { CreateVmAutomationDto, UpdateVmAutomationDto } from './vmAutomation.service';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class VmAutomationController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const automations = await vmAutomationService.list(authReq.user.userId);
      success(res, 'Automations retrieved.', { automations });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const automation = await vmAutomationService.getById(
        req.params['automationId'] as string,
        authReq.user.userId,
        authReq.user.role
      );
      success(res, 'Automation retrieved.', { automation });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const automation = await vmAutomationService.create(
        authReq.user.userId,
        authReq.user.role,
        req.body as CreateVmAutomationDto
      );
      success(res, 'Automation created.', { automation }, 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const automation = await vmAutomationService.update(
        req.params['automationId'] as string,
        authReq.user.userId,
        authReq.user.role,
        req.body as UpdateVmAutomationDto
      );
      success(res, 'Automation updated.', { automation });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      await vmAutomationService.delete(
        req.params['automationId'] as string,
        authReq.user.userId,
        authReq.user.role
      );
      success(res, 'Automation deleted.');
    } catch (error) {
      next(error);
    }
  }
}

export const vmAutomationController = new VmAutomationController();
