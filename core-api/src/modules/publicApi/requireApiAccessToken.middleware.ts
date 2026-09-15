import type { Request, Response, NextFunction } from 'express';
import { Tenant } from '../../models/tenant.model';
import type { AuthenticatedRequest } from '../../types';
import { verifyApiAccessToken } from '../../utils/jwt';
import type { TenantAuthUser } from '../../middleware/requireTenantAuth.middleware';
import type { TenantContextRequest } from '../../middleware/resolveTenantContext.middleware';
import { sendInvalidToken } from './publicApi.errors';
import { loadActiveApiCredentialForToken } from './apiCredentialPublicAuth.service';

/** Set by requireApiAccessToken for scope checks and probe routes. */
export interface ApiAccessContext {
  credentialId: string;
  clientId: string;
  ownerType: 'tenant' | 'platform';
  tenantId: string | null;
  adminId: string | null;
  scopes: string[];
  rateLimitPerMin: number | null;
}

export interface ApiAccessAuthenticatedRequest extends Request {
  apiScopes: string[];
  apiAccess: ApiAccessContext;
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Reproduce gateway verifyMiddleware identity headers for downstream code that reads them.
 * @see cloud-gateway/src/middleware/verify.middleware.ts
 */
function forwardIdentityHeaders(
  req: Request,
  input: {
    userId: string;
    role: string;
    sessionId: string;
    tenantId?: string;
  }
): void {
  req.headers['x-user-id'] = input.userId;
  req.headers['x-user-role'] = input.role;
  req.headers['x-session-id'] = input.sessionId;
  if (input.tenantId) {
    req.headers['x-tenant-id'] = input.tenantId;
  }
}

async function requireApiAccessTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = readBearerToken(req);
  if (!token) {
    sendInvalidToken(res, 'Authorization header missing or malformed.');
    return;
  }

  const payload = verifyApiAccessToken(token);
  if (!payload) {
    sendInvalidToken(res, 'Invalid or expired access token.');
    return;
  }

  // Fresh DB read on every request — revocation must invalidate before JWT exp.
  const credential = await loadActiveApiCredentialForToken(payload);
  if (!credential) {
    sendInvalidToken(res, 'Invalid or expired access token.');
    return;
  }

  const sessionId = `api:${payload.jti}`;
  const scopes = [...credential.scopes];

  (req as ApiAccessAuthenticatedRequest).apiScopes = scopes;
  (req as ApiAccessAuthenticatedRequest).apiAccess = {
    credentialId: credential._id.toString(),
    clientId: credential.clientId,
    ownerType: credential.ownerType,
    tenantId: credential.tenantId?.toString() ?? null,
    adminId: credential.adminId?.toString() ?? null,
    scopes,
    rateLimitPerMin: credential.rateLimitPerMin ?? null,
  };

  if (credential.ownerType === 'tenant' && credential.tenantId) {
    const tenantId = credential.tenantId.toString();
    const tenant = await Tenant.findById(credential.tenantId).select('_id slug status').lean();

    const tenantReq = req as TenantContextRequest & {
      tenantUser: TenantAuthUser;
    };

    tenantReq.tenantContext = tenant
      ? { id: tenant._id.toString(), slug: tenant.slug, status: tenant.status }
      : { id: tenantId, slug: '', status: 'unknown' };

    tenantReq.tenantUser = {
      id: credential.createdBy.toString(),
      tenantId,
      role: 'tenant_admin',
    };

    forwardIdentityHeaders(req, {
      userId: credential.createdBy.toString(),
      role: 'tenant_admin',
      sessionId,
      tenantId,
    });
  } else if (credential.ownerType === 'platform' && credential.adminId) {
    const adminId = credential.adminId.toString();
    const authReq = req as AuthenticatedRequest;
    authReq.user = {
      userId: adminId,
      role: 'admin',
      sessionId,
    };

    forwardIdentityHeaders(req, {
      userId: adminId,
      role: 'admin',
      sessionId,
    });
  } else {
    sendInvalidToken(res, 'Invalid or expired access token.');
    return;
  }

  next();
}

/**
 * OAuth2 api_access Bearer auth for /api/v1/public/*.
 * Sets the same req.user / req.tenantUser shapes as session JWT auth for Phase 4 handlers.
 */
export function requireApiAccessToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void requireApiAccessTokenHandler(req, res, next).catch(next);
}
