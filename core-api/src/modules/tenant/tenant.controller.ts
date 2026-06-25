import type { Request, Response, NextFunction } from 'express';
import { tenantService } from './tenant.service';
import {
  tenantBrandingAssetService,
  resolveBrandingAssetType,
} from './tenantBrandingAsset.service';
import type { AuthenticatedRequest } from '../../types';
import type { CreateTenantInput, CreateTenantAdminInput, UpdateTenantInput } from './tenant.validation';
import type { TenantStatus } from '../../models/tenant.model';
import { ValidationError } from '../../utils/errors';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

/** Multer memory upload — works with or without @types/multer global augmentation */
type BrandingUploadRequest = Omit<Request, 'file'> & {
  file?: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
};

export class TenantController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenant = await tenantService.createTenant(
        req.body as CreateTenantInput,
        authReq.user.userId
      );
      success(res, 'Tenant created.', { tenant }, 201);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const status = req.query['status'] as TenantStatus | undefined;

      const result = await tenantService.listTenants(page, limit, status);
      success(res, 'Tenants retrieved.', result);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const tenant = await tenantService.getTenantById(id);
      success(res, 'Tenant retrieved.', { tenant });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as UpdateTenantInput & { slug?: string; createdBy?: string };

      const updates: UpdateTenantInput = { ...body };
      delete (updates as { slug?: string }).slug;
      delete (updates as { createdBy?: string }).createdBy;

      const tenant = await tenantService.updateTenant(id, updates);
      success(res, 'Tenant updated.', { tenant });
    } catch (error) {
      next(error);
    }
  }

  async createAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const admin = await tenantService.createTenantAdmin(
        tenantId,
        req.body as CreateTenantAdminInput
      );
      success(res, 'Tenant admin created.', { admin }, 201);
    } catch (error) {
      next(error);
    }
  }

  async uploadBrandingAsset(req: BrandingUploadRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const assetType = resolveBrandingAssetType((req.body as { assetType?: string }).assetType);
      if (!assetType) {
        throw new ValidationError(
          'assetType is required. Use logo, favicon, or login-page-image.'
        );
      }

      const file = req.file;
      if (!file) {
        throw new ValidationError('File is required. Use multipart field name "file".');
      }

      const doc = await tenantBrandingAssetService.uploadAsset(id, assetType, {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
      });

      const tenant = await tenantService.getTenantById(id);

      success(
        res,
        'Branding asset uploaded.',
        {
          assetType,
          byteSize: doc.byteSize,
          mimeType: doc.mimeType,
          filename: doc.filename,
          url: tenant.branding[assetType === 'login_page_image' ? 'loginPageImageUrl' : assetType === 'logo' ? 'logoUrl' : 'faviconUrl'],
          tenant,
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }
}

export const tenantController = new TenantController();
