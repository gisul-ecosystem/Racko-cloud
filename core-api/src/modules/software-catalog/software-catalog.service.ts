import mongoose from 'mongoose';
import { SoftwareCatalogModel, type ISoftwareCatalog } from './software-catalog.model';
import type { CreateSoftwareCatalogDto, SoftwareCatalogResponse } from './software-catalog.types';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

class SoftwareCatalogService {
  private toResponse(doc: ISoftwareCatalog): SoftwareCatalogResponse {
    return {
      _id:           doc._id.toString(),
      name:          doc.name,
      version:       doc.version,
      supportedOS:   doc.supportedOS,
      installMethod: doc.installMethod,
      wingetId:      doc.wingetId,
      aptName:       doc.aptName,
      brewName:      doc.brewName,
      chocoName:     doc.chocoName,
      fileUrl:       doc.fileUrl,
      fileName:      doc.fileName,
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
    return this.toResponse(doc);
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
    await doc.deleteOne();
    logger.info('[SoftwareCatalog] Deleted software', { softwareId: id.toString() });
  }
}

export const softwareCatalogService = new SoftwareCatalogService();
