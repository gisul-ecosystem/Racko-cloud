import type { Request, Response, NextFunction } from 'express';
import type { GatewayRequest } from '../types';

/**
 * Injects x-tenant-id from gateway host resolution before proxying to core-api.
 * Browser never sends this header — only the gateway does.
 */
export function injectTenantHeader(req: Request, _res: Response, next: NextFunction): void {
  const gatewayReq = req as GatewayRequest;
  if (gatewayReq.tenantContext?.id) {
    req.headers['x-tenant-id'] = gatewayReq.tenantContext.id;
  }
  next();
}
