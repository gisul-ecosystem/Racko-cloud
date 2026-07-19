import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { TenantTokenPayload } from '../modules/tenantAuth/tenantAuth.service';
import type { TenantContextRequest } from './resolveTenantContext.middleware';

export type TenantUserRole = 'tenant_admin' | 'tenant_user';

export interface TenantAuthUser {
  id: string;
  tenantId: string;
  role: TenantUserRole;
}

export interface TenantAuthenticatedRequest extends TenantContextRequest {
  tenantUser: TenantAuthUser;
}

function unauthorized(res: Response, message: string): void {
  res.status(401).json({ success: false, message, code: 'UNAUTHORIZED' });
}

function verifyTenantToken(token: string): TenantTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as TenantTokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function requireTenantAuth(
  req: TenantContextRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    unauthorized(res, 'Authorization header missing or malformed.');
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyTenantToken(token);
  if (!payload) {
    unauthorized(res, 'Invalid or expired access token.');
    return;
  }

  if (payload.type !== 'tenant') {
    unauthorized(res, 'Invalid token type.');
    return;
  }

  if (!req.tenantContext?.id) {
    unauthorized(res, 'TENANT_MISMATCH');
    return;
  }

  if (String(payload.tenantId) !== String(req.tenantContext.id)) {
    unauthorized(res, 'TENANT_MISMATCH');
    return;
  }

  (req as TenantAuthenticatedRequest).tenantUser = {
    id: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
  };
  next();
}

export function requireTenantRole(...allowedRoles: TenantUserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tenantReq = req as TenantAuthenticatedRequest;
    if (!tenantReq.tenantUser || !allowedRoles.includes(tenantReq.tenantUser.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    next();
  };
}
