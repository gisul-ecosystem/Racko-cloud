import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { TenantAuthenticatedRequest } from './tenantAuth.middleware';

type TenantServiceKey = 'azure' | 'aws' | 'gcp';

interface TenantServicesResponse {
  success?: boolean;
  data?: {
    services?: Array<{ serviceKey: string; status: string }>;
  };
}

/**
 * Ensures the authenticated tenant has the given service assigned and active.
 * Uses the caller's tenant JWT against core-api tenant-services.
 */
export function requireTenantAssignedService(serviceKey: TenantServiceKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as TenantAuthenticatedRequest;
    const tenantId = authReq.tenantAuth?.tenantId ?? authReq.tenantContext?.id;
    const authHeader = req.headers.authorization;

    if (!tenantId || !authHeader) {
      return next(new UnauthorizedError('Tenant authentication required.'));
    }

    try {
      const response = await fetch(`${config.CORE_API_URL}/api/v1/tenant-services`, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'x-tenant-id': String(tenantId),
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.warn('Tenant service entitlement check failed', {
          tenantId,
          serviceKey,
          status: response.status,
        });
        return next(new ForbiddenError('Unable to verify tenant service entitlement.'));
      }

      const body = (await response.json()) as TenantServicesResponse;
      const services = body.data?.services ?? [];
      const assigned = services.find(
        (service) => service.serviceKey === serviceKey && service.status === 'active'
      );

      if (!assigned) {
        return next(new ForbiddenError(`Service '${serviceKey}' is not enabled for this tenant.`));
      }

      next();
    } catch (error) {
      logger.error('Tenant service entitlement check error', {
        tenantId,
        serviceKey,
        message: error instanceof Error ? error.message : String(error),
      });
      next(new ForbiddenError('Unable to verify tenant service entitlement.'));
    }
  };
}

/**
 * Only tenant_admin may use tenant cloud automation (create/list Azure/AWS requests).
 */
export function requireTenantAdminRole(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as TenantAuthenticatedRequest;
  if (authReq.tenantAuth?.role !== 'tenant_admin') {
    return next(new ForbiddenError('Only tenant admins can manage cloud automation for this workspace.'));
  }
  next();
}

/**
 * Maps tenant identity onto cloud-automation Racko user headers.
 * Uses a stable per-tenant id so all tenant admins share that tenant's requests.
 */
export function injectTenantCloudUserHeaders(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as TenantAuthenticatedRequest;
  const tenantId = authReq.tenantAuth?.tenantId ?? authReq.tenantContext?.id;

  if (!tenantId) {
    return next(new UnauthorizedError('Tenant context required.'));
  }

  req.headers['x-user-id'] = `tenant:${tenantId}`;
  req.headers['x-user-role'] = 'tenant_admin';
  req.headers['x-tenant-id'] = String(tenantId);

  const tenantDomain = String(authReq.tenantContext?.domain || '').trim().toLowerCase();
  if (tenantDomain) {
    req.headers['x-tenant-domain'] = tenantDomain;
  }

  next();
}
