import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { softwareCatalogService } from './software-catalog.service';
import type { AuthenticatedRequest } from '../../types';
import type { CreateSoftwareCatalogInput } from './software-catalog.validation';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class SoftwareCatalogController {
  /** GET /api/v1/software-catalog */
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const catalog = await softwareCatalogService.listAll();
      success(res, 'Software catalog retrieved.', { catalog, total: catalog.length });
    } catch (err) { next(err); }
  }

  /** GET /api/v1/software-catalog/:id — used by agent to resolve install details */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const software = await softwareCatalogService.getById(id);
      success(res, 'Software retrieved.', { software });
    } catch (err) { next(err); }
  }

  /** POST /api/v1/software-catalog */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedBy = new mongoose.Types.ObjectId(
        (req as AuthenticatedRequest).user.userId
      );
      const software = await softwareCatalogService.addSoftware(
        req.body as CreateSoftwareCatalogInput,
        uploadedBy
      );
      success(res, 'Software added to catalog.', { software }, 201);
    } catch (err) { next(err); }
  }

  /** DELETE /api/v1/software-catalog/:id */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      await softwareCatalogService.deleteSoftware(id);
      success(res, 'Software deleted from catalog.');
    } catch (err) { next(err); }
  }
}

export const softwareCatalogController = new SoftwareCatalogController();
