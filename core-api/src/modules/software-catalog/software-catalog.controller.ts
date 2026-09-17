import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { softwareCatalogService } from './software-catalog.service';
import type { AuthenticatedRequest } from '../../types';
import type { CreateSoftwareCatalogInput, UpdateSoftwareCatalogInput } from './software-catalog.validation';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class SoftwareCatalogController {
  /** POST /api/v1/software-catalog/upload-url — issue presigned PUT URL for direct browser→SeaweedFS upload */
  async issueUploadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedBy = new mongoose.Types.ObjectId(
        (req as AuthenticatedRequest).user.userId
      );
      const { fileName, mimeType } = req.body as { fileName: string; mimeType: string };
      if (!fileName || !mimeType) {
        res.status(400).json({ success: false, message: 'fileName and mimeType are required.' });
        return;
      }
      const result = await softwareCatalogService.issueUploadUrl(fileName, mimeType, uploadedBy);
      success(res, 'Upload URL issued.', result);
    } catch (err) { next(err); }
  }

  /** POST /api/v1/software-catalog/upload-url/multipart/start */
  async startMultipartUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedBy = new mongoose.Types.ObjectId(
        (req as AuthenticatedRequest).user.userId
      );
      const { fileName, mimeType } = req.body as { fileName: string; mimeType: string };
      if (!fileName || !mimeType) {
        res.status(400).json({ success: false, message: 'fileName and mimeType are required.' });
        return;
      }
      const result = await softwareCatalogService.initiateMultipartUpload(fileName, mimeType, uploadedBy);
      success(res, 'Multipart upload initiated.', result);
    } catch (err) { next(err); }
  }

  /** POST /api/v1/software-catalog/upload-url/multipart/part */
  async getMultipartPartUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { storageRef, uploadId, partNumber } = req.body as {
        storageRef: string;
        uploadId: string;
        partNumber: number;
      };
      if (!storageRef || !uploadId || !partNumber) {
        res.status(400).json({ success: false, message: 'storageRef, uploadId and partNumber are required.' });
        return;
      }
      const result = await softwareCatalogService.issuePartUploadUrl(storageRef, uploadId, partNumber);
      success(res, 'Part upload URL issued.', result);
    } catch (err) { next(err); }
  }

  /** POST /api/v1/software-catalog/upload-url/multipart/complete */
  async completeMultipartUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { storageRef, uploadId, parts } = req.body as {
        storageRef: string;
        uploadId: string;
        parts: Array<{ PartNumber: number; ETag: string }>;
      };
      if (!storageRef || !uploadId || !Array.isArray(parts) || parts.length === 0) {
        res.status(400).json({ success: false, message: 'storageRef, uploadId and parts are required.' });
        return;
      }
      const result = await softwareCatalogService.completeMultipartUpload(storageRef, uploadId, parts);
      success(res, 'Multipart upload completed.', result);
    } catch (err) { next(err); }
  }

  /** POST /api/v1/software-catalog/upload-url/multipart/abort */
  async abortMultipartUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { storageRef, uploadId } = req.body as { storageRef: string; uploadId: string };
      if (!storageRef || !uploadId) {
        res.status(400).json({ success: false, message: 'storageRef and uploadId are required.' });
        return;
      }
      await softwareCatalogService.abortMultipartUpload(storageRef, uploadId);
      success(res, 'Multipart upload aborted.');
    } catch (err) { next(err); }
  }

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

  /** PATCH /api/v1/software-catalog/:id */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const software = await softwareCatalogService.updateSoftware(
        id,
        req.body as UpdateSoftwareCatalogInput
      );
      success(res, 'Software updated.', { software });
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
