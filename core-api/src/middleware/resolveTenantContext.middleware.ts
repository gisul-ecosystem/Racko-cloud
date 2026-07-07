import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Tenant } from '../models/tenant.model';

export interface TenantContext {
  id: string;
  slug: string;
  status: string;
}

export interface TenantContextRequest extends Request {
  tenantContext?: TenantContext;
}

function getTenantIdHeader(req: Request): string | null {
  const raw = req.headers['x-tenant-id'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves x-tenant-id header into req.tenantContext (active tenant lookup optional —
 * header id is trusted for host-isolation re-check in requireTenantAuth).
 */
export async function resolveTenantContext(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tenantId = getTenantIdHeader(req);
    if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
      next();
      return;
    }

    const tenant = await Tenant.findById(tenantId).select('_id slug status').lean();
    if (!tenant) {
      next();
      return;
    }

    (req as TenantContextRequest).tenantContext = {
      id: tenant._id.toString(),
      slug: tenant.slug,
      status: tenant.status,
    };
    next();
  } catch (error) {
    next(error);
  }
}
