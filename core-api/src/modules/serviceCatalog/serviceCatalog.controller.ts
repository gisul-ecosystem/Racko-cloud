import type { Request, Response, NextFunction } from 'express';
import { serviceCatalogService } from './serviceCatalog.service';
import type { PatchServiceCatalogInput } from './serviceCatalog.validation';
import type { ServiceCatalogKind, ServiceCatalogScope } from '../../models/serviceCatalog.model';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const kind = req.query['kind'] as ServiceCatalogKind | undefined;
    const scope = req.query['scope'] as ServiceCatalogScope | undefined;
    const status = req.query['status'] as 'active' | 'deprecated' | 'hidden' | undefined;
    const include = req.query['include'] as 'active' | 'all' | undefined;

    const services = await serviceCatalogService.list({
      kind,
      scope,
      status,
      activeOnly: include === 'all' ? false : status ? false : true,
    });

    success(res, 'Service catalog retrieved.', { services });
  } catch (err) {
    next(err);
  }
}

async function patch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const key = req.params['key'] as string;
    const body = req.body as PatchServiceCatalogInput;
    const service = await serviceCatalogService.patch(key, body);
    success(res, 'Service catalog entry updated.', { service });
  } catch (err) {
    next(err);
  }
}

export const serviceCatalogController = {
  list,
  patch,
};
