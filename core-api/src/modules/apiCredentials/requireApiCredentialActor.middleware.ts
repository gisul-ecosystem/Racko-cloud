import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../../config';
import type { AccessTokenPayload } from '../../types';
import type { TenantContextRequest } from '../../middleware/resolveTenantContext.middleware';
import type { TenantTokenPayload } from '../tenantAuth/tenantAuth.service';
import { ForbiddenError, UnauthorizedError } from '../../utils/errors';

export interface ApiCredentialActor {
  ownerType: 'tenant' | 'platform';
  tenantId?: mongoose.Types.ObjectId;
  adminId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

export interface ApiCredentialActorRequest extends TenantContextRequest {
  apiCredentialActor: ApiCredentialActor;
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/**
 * Platform org admins and tenant admins may manage OAuth client credentials
 * scoped to their respective owner (adminId or tenantId from JWT).
 */
export function requireApiCredentialActor(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = readBearerToken(req);
  if (!token) {
    next(new UnauthorizedError('Authorization header missing or malformed.'));
    return;
  }

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
    const tenantReq = req as TenantContextRequest;

    if (payload.role !== 'tenant_admin') {
      next(new ForbiddenError('Only tenant admins can manage API credentials.'));
      return;
    }

    if (!tenantReq.tenantContext?.id) {
      next(new UnauthorizedError('TENANT_MISMATCH'));
      return;
    }

    if (String(payload.tenantId) !== String(tenantReq.tenantContext.id)) {
      next(new UnauthorizedError('TENANT_MISMATCH'));
      return;
    }

    (req as ApiCredentialActorRequest).apiCredentialActor = {
      ownerType: 'tenant',
      tenantId: new mongoose.Types.ObjectId(payload.tenantId),
      createdBy: new mongoose.Types.ObjectId(payload.sub),
    };
    next();
    return;
  }

  const platform = decoded as unknown as AccessTokenPayload;
  if (!platform.userId || !platform.role) {
    next(new UnauthorizedError('Invalid or expired access token.'));
    return;
  }

  if (platform.role !== 'admin' && platform.role !== 'super_admin') {
    next(new ForbiddenError('Only platform admins can manage API credentials.'));
    return;
  }

  (req as ApiCredentialActorRequest).apiCredentialActor = {
    ownerType: 'platform',
    adminId: new mongoose.Types.ObjectId(platform.userId),
    createdBy: new mongoose.Types.ObjectId(platform.userId),
  };
  next();
}
