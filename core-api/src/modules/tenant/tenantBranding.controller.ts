import type { Request, Response, NextFunction } from 'express';
import type { TenantContextRequest } from '../../middleware/resolveTenantContext.middleware';
import {
  tenantBrandingAssetService,
  resolveBrandingAssetType,
} from './tenantBrandingAsset.service';
import { NotFoundError, ValidationError } from '../../utils/errors';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

function resolveTenantId(req: Request): string | null {
  const ctx = (req as TenantContextRequest).tenantContext?.id;
  if (ctx) return ctx;
  const header = req.headers['x-tenant-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const queryId = req.query['tenantId'];
  if (typeof queryId === 'string' && queryId.trim()) return queryId.trim();
  return null;
}

export class TenantBrandingController {
  async getMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        res.status(401).json({ success: false, message: 'TENANT_NOT_FOUND' });
        return;
      }

      const branding = await tenantBrandingAssetService.getPublicBranding(tenantId);
      success(res, 'Tenant branding retrieved.', { tenantId, branding });
    } catch (error) {
      next(error);
    }
  }

  async serveAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const assetType = resolveBrandingAssetType(req.query['assetType']);
      if (!assetType) {
        throw new ValidationError(
          'assetType query parameter is required. Use logo, favicon, or login-page-image.'
        );
      }

      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        res.status(401).json({ success: false, message: 'TENANT_NOT_FOUND' });
        return;
      }

      const asset = await tenantBrandingAssetService.getAssetBytes(tenantId, assetType);
      if (!asset) {
        throw new NotFoundError('Branding asset not found.');
      }

      res.setHeader('Content-Type', asset.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(asset.buffer);
    } catch (error) {
      next(error);
    }
  }
}

export const tenantBrandingController = new TenantBrandingController();
