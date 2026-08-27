import mongoose from 'mongoose';
import { SoftwareCatalogModel, type ISoftwareCatalog } from './software-catalog.model';
import type { CreateSoftwareCatalogDto, SoftwareCatalogResponse } from './software-catalog.types';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { resolveSoftwareIconUrl } from './software-catalog.icons';
import { seaweedfsService } from '../../services/seaweedfs.service';

class SoftwareCatalogService {
  private toResponse(doc: ISoftwareCatalog): SoftwareCatalogResponse {
    return {
      _id:           doc._id.toString(),
      name:          doc.name,
      version:       doc.version,
      iconUrl:       resolveSoftwareIconUrl(doc.name, doc.iconUrl),
      supportedOS:   doc.supportedOS,
      installMethod: doc.installMethod,
      wingetId:      doc.wingetId,
      aptName:       doc.aptName,
      brewName:      doc.brewName,
      chocoName:     doc.chocoName,
      fileUrl:       doc.fileUrl,
      fileName:      doc.fileName,
      zipInstallScript: doc.zipInstallScript,
      installArgs:   doc.installArgs,
      uploadedBy:    doc.uploadedBy.toString(),
      createdAt:     doc.createdAt.toISOString(),
      updatedAt:     doc.updatedAt.toISOString(),
    };
  }

  async listAll(): Promise<SoftwareCatalogResponse[]> {
    const docs = await SoftwareCatalogModel.find().sort({ createdAt: -1 });
    return docs.map((d) => this.toResponse(d));
  }

  async getById(id: mongoose.Types.ObjectId): Promise<SoftwareCatalogResponse> {
    const doc = await SoftwareCatalogModel.findById(id);
    if (!doc) throw new NotFoundError('Software not found.');
    const response = this.toResponse(doc);
    // If fileUrl is an internal storageRef, resolve it to a presigned GET URL
    // so the agent can download it directly without authentication.
    if (response.fileUrl && response.fileUrl.startsWith('software-catalog/')) {
      try {
        response.fileUrl = await this.getDownloadUrl(response.fileUrl);
      } catch {
        // Non-fatal — agent will get an error when it tries to download
        logger.warn('[SoftwareCatalog] Could not generate presigned GET URL', { storageRef: response.fileUrl });
      }
    }
    return response;
  }

  async issueUploadUrl(
    fileName: string,
    mimeType: string,
    uploadedBy: mongoose.Types.ObjectId
  ): Promise<{ presignedUrl: string; storageRef: string; expiresIn: number }> {
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const ts = Date.now().toString();
    // Store under software-catalog/ prefix — separate from shared-files
    const { presignedUrl, storageRef } = await seaweedfsService.generatePresignedPutUrl(
      `software-catalog/${uploadedBy.toString()}`,
      ts,
      safeFileName,
      mimeType,
      3600,
    );

    logger.info('[SoftwareCatalog] Presigned PUT URL issued', {
      fileName, storageRef, uploadedBy: uploadedBy.toString(),
    });

    return { presignedUrl, storageRef, expiresIn: 3600 };
  }

  /**
   * Returns a presigned GET URL for an internally stored software file.
   * Called by the agent when it fetches software details before installing.
   * TTL: 10 minutes — enough for the agent to start the download.
   */
  async getDownloadUrl(storageRef: string): Promise<string> {
    const { presignedUrl } = await seaweedfsService.generatePresignedGetUrl(storageRef, 600);
    return presignedUrl;
  }

  async addSoftware(
    dto: CreateSoftwareCatalogDto,
    uploadedBy: mongoose.Types.ObjectId
  ): Promise<SoftwareCatalogResponse> {
    const doc = await SoftwareCatalogModel.create({ ...dto, uploadedBy });

    logger.info('[SoftwareCatalog] Added software', {
      softwareId: doc._id.toString(),
      name: doc.name,
      version: doc.version,
      installMethod: doc.installMethod,
      uploadedBy: uploadedBy.toString(),
    });

    return this.toResponse(doc);
  }

  async deleteSoftware(id: mongoose.Types.ObjectId): Promise<void> {
    const doc = await SoftwareCatalogModel.findById(id);
    if (!doc) throw new NotFoundError('Software not found.');

    // Delete the uploaded file from SeaweedFS if it was stored internally.
    // Only internal storageRefs start with 'software-catalog/' — external URLs are left alone.
    if (doc.fileUrl && doc.fileUrl.startsWith('software-catalog/')) {
      await seaweedfsService.delete(doc.fileUrl);
      logger.info('[SoftwareCatalog] Deleted S3 file', {
        softwareId: id.toString(),
        storageRef: doc.fileUrl,
      });
    }

    await doc.deleteOne();
    logger.info('[SoftwareCatalog] Deleted software', { softwareId: id.toString() });
  }
}

export const softwareCatalogService = new SoftwareCatalogService();
