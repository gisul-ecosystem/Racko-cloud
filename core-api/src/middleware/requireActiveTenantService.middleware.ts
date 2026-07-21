import type { Request, Response, NextFunction } from 'express';
import type { ServiceKey } from '../constants/serviceCatalog';
import { TenantServiceConfig } from '../models/tenantServiceConfig.model';
import type { TenantAuthenticatedRequest } from './requireTenantAuth.middleware';

export function requireActiveTenantService(...serviceKeys: ServiceKey[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantReq = req as TenantAuthenticatedRequest;
    const tenantId = tenantReq.tenantUser?.tenantId;
    if (!tenantId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const active = await TenantServiceConfig.exists({
      tenantId,
      serviceKey: { $in: serviceKeys },
      status: 'active',
    });

    if (!active) {
      res.status(403).json({
        success: false,
        message: `Service not enabled for this tenant.`,
        code: 'SERVICE_NOT_ENABLED',
      });
      return;
    }

    next();
  };
}
