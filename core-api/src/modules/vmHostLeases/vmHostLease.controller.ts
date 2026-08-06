import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { vmHostLeaseService } from './vmHostLease.service';
import type { AuthenticatedRequest } from '../../types';
import type {
  CreateVmHostLeaseInput,
  ListVmHostLeasesQuery,
  UpdateVmHostLeaseInput,
} from './vmHostLease.validation';
import { ValidationError } from '../../utils/errors';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class VmHostLeaseController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as ListVmHostLeasesQuery;
      const result = await vmHostLeaseService.list(query);
      success(res, 'VM host leases retrieved.', result);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const lease = await vmHostLeaseService.getById(id);
      success(res, 'VM host lease retrieved.', { lease });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedBy = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const lease = await vmHostLeaseService.create(req.body as CreateVmHostLeaseInput, uploadedBy);
      success(res, 'VM host lease created.', { lease }, 201);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const lease = await vmHostLeaseService.update(id, req.body as UpdateVmHostLeaseInput);
      success(res, 'VM host lease updated.', { lease });
    } catch (err) {
      next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      await vmHostLeaseService.remove(id);
      success(res, 'VM host lease deleted.', {});
    } catch (err) {
      next(err);
    }
  }

  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file?.buffer?.length) {
        throw new ValidationError('Excel file is required (field name: file).');
      }

      const uploadedBy = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const result = await vmHostLeaseService.uploadFromExcel(
        file.buffer,
        uploadedBy,
        file.originalname || 'upload.xlsx'
      );

      success(
        res,
        `Imported ${result.imported} VM host lease(s).`,
        {
          imported: result.imported,
          skippedErrors: result.skippedErrors,
          leases: result.leases,
          stats: result.stats,
        },
        201
      );
    } catch (err) {
      next(err);
    }
  }
}

export const vmHostLeaseController = new VmHostLeaseController();
