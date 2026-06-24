import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';

interface TenantAccessTokenPayload {
  sub: string;
  tenantId: string;
  role: 'tenant_admin' | 'tenant_user';
  type: 'tenant';
}

/**
 * Validates tenant JWT locally (type: 'tenant').
 * Does NOT use platform verifyMiddleware — tenant tokens are a separate auth plane.
 */
export function tenantAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authorization header missing or malformed.'));
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as TenantAccessTokenPayload;

    if (payload.type !== 'tenant') {
      return next(new UnauthorizedError('Invalid token type.'));
    }

    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token.'));
  }
}
