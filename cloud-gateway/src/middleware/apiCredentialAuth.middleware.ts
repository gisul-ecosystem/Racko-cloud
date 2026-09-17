import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import type { AuthenticatedRequest, GatewayRequest, UserRole } from '../types';
import type { TenantTokenPayload } from './tenantAuth.middleware';
import { verifyMiddleware } from './verify.middleware';

interface PlatformAccessPayload {
  userId: string;
  role: string;
  sessionId: string;
}

/**
 * OAuth credential management: platform admin JWT (with session verify) or
 * tenant admin JWT on a tenant host (x-tenant-id injected by requireTenantBearer path
 * or tenant context from host).
 */
export function requireApiCredentialManagementAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Authorization header missing or malformed.'));
    return;
  }

  const token = authHeader.slice(7);

  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
  } catch {
    next(new UnauthorizedError('Invalid or expired access token.'));
    return;
  }

  if (decoded.type === 'tenant') {
    const payload = decoded as unknown as TenantTokenPayload;
    const gatewayReq = req as GatewayRequest;

    if (!gatewayReq.tenantContext?.id) {
      next(new UnauthorizedError('TENANT_NOT_FOUND'));
      return;
    }

    if (String(payload.tenantId) !== String(gatewayReq.tenantContext.id)) {
      next(new ForbiddenError('TENANT_MISMATCH'));
      return;
    }

    if (payload.role !== 'tenant_admin') {
      next(new ForbiddenError('Forbidden'));
      return;
    }

    req.headers['x-tenant-id'] = gatewayReq.tenantContext.id;
    next();
    return;
  }

  const platform = decoded as unknown as PlatformAccessPayload;
  if (!platform.userId || !platform.role) {
    next(new UnauthorizedError('Invalid or expired access token.'));
    return;
  }

  if (platform.role !== 'admin' && platform.role !== 'super_admin') {
    next(new ForbiddenError('Forbidden'));
    return;
  }

  (req as AuthenticatedRequest).user = {
    userId: platform.userId,
    role: platform.role as UserRole,
    sessionId: platform.sessionId,
  };

  void verifyMiddleware(req, res, next);
}
