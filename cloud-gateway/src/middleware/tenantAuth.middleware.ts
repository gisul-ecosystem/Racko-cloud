import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import type { GatewayRequest } from '../types';

interface TenantTokenPayload {
  sub: string;
  tenantId: string;
  role: string;
  type: string;
  iat?: number;
  exp?: number;
}

/**
 * Injects x-tenant-id from host-resolved tenantContext before proxying to core-api.
 */
export function injectTenantHeader(req: Request, _res: Response, next: NextFunction): void {
  const gatewayReq = req as GatewayRequest;
  if (gatewayReq.tenantContext?.id) {
    req.headers['x-tenant-id'] = gatewayReq.tenantContext.id;
  }
  next();
}

/**
 * Validates tenant JWT (type: tenant) and ensures host tenant matches token tenantId.
 * Does not use platform auth/validate — tenant tokens are a separate auth path.
 */
export function requireTenantBearer(req: Request, _res: Response, next: NextFunction): void {
  const gatewayReq = req as GatewayRequest;
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authorization header missing or malformed.'));
  }

  if (!gatewayReq.tenantContext?.id) {
    return next(new UnauthorizedError('TENANT_NOT_FOUND'));
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as TenantTokenPayload;

    if (payload.type !== 'tenant') {
      return next(new UnauthorizedError('Invalid token type.'));
    }

    if (String(payload.tenantId) !== String(gatewayReq.tenantContext.id)) {
      return next(new ForbiddenError('TENANT_MISMATCH'));
    }

    req.headers['x-tenant-id'] = gatewayReq.tenantContext.id;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token.'));
  }
}
