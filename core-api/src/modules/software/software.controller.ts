import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { softwareService } from './software.service';
import type { AuthenticatedRequest } from '../../types';
import type { CreateSoftwareInput, UpdateSoftwareInput } from './software.validation';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class SoftwareController {
  /** GET /api/v1/software — active only, shown on VM create page */
  async listActive(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await softwareService.listActive();
      success(res, 'Software list retrieved.', { software: items, total: items.length });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/v1/software/all — all entries, super admin only */
  async listAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await softwareService.listAll();
      success(res, 'Software list retrieved.', { software: items, total: items.length });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/v1/software */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const createdBy = new mongoose.Types.ObjectId(authReq.user.userId);
      const sw = await softwareService.create(req.body as CreateSoftwareInput, createdBy);
      success(res, 'Software created.', { software: sw }, 201);
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/v1/software/:softwareId */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const softwareId = new mongoose.Types.ObjectId(req.params['softwareId'] as string);
      const sw = await softwareService.update(softwareId, req.body as UpdateSoftwareInput);
      success(res, 'Software updated.', { software: sw });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/v1/software/:softwareId */
  async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const softwareId = new mongoose.Types.ObjectId(req.params['softwareId'] as string);
      await softwareService.deactivate(softwareId);
      success(res, 'Software deactivated.');
    } catch (err) {
      next(err);
    }
  }
}

export const softwareController = new SoftwareController();
