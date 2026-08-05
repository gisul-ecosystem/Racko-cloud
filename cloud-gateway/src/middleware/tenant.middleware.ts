import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { GatewayRequest, TenantContext, TenantResolveResponse } from '../types';

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  value: TenantContext | null;
  expiresAt: number;
}

const tenantCache = new Map<string, CacheEntry>();

/**
 * Resolve the request host for tenant lookup.
 *
 * // trust proxy must be configured to your nginx/LB IP only — see
 * // cloud-gateway/src/app.ts app.set('trust proxy', ...)
 */
function headerToString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

function isLocalGatewayHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

function resolveHost(req: Request): string | null {
  const raw =
    headerToString(req.headers['x-forwarded-host']) ?? headerToString(req.headers['host']);

  if (!raw) return null;

  const firstHop = raw.split(',')[0]?.trim() ?? '';
  const withoutPort = firstHop.replace(/:\d+$/, '');
  const normalized = withoutPort.toLowerCase().trim();

  if (!normalized) return null;

  // Local / loopback gateway: honor X-Tenant-Domain so tenant portals can
  // call localhost:8000 without DNS mapping (dev and docker alike).
  if (isLocalGatewayHost(normalized) && headerToString(req.headers['x-tenant-domain'])) {
    const override = headerToString(req.headers['x-tenant-domain'])!
      .replace(/:\d+$/, '')
      .toLowerCase()
      .trim();
    return override.length > 0 ? override : normalized;
  }

  return normalized;
}

async function fetchTenantFromCoreApi(
  host: string,
  requestId?: string
): Promise<TenantContext | null> {
  try {
    const response = await axios.post<TenantResolveResponse>(
      `${config.CORE_API_URL}/internal/tenants/resolve`,
      { host },
      {
        timeout: 3000,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': config.INTERNAL_SERVICE_SECRET,
          'X-Request-ID': requestId ?? '',
        },
      }
    );

    return {
      id: response.data.id,
      slug: response.data.slug,
      status: response.data.status,
      ipAccessMode: response.data.ipAccessMode ?? 'all',
      allowedIps: response.data.allowedIps ?? [],
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }

    if (axios.isAxiosError(error)) {
      logger.debug('Tenant resolve failed — treating as no tenant', {
        host,
        status: error.response?.status,
        error: error.message,
      });
    }

    return null;
  }
}

/**
 * Resolves tenant context from the request host via core-api internal lookup.
 * Never blocks the pipeline — req.tenantContext is null when no tenant matches.
 */
export async function tenantResolver(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const gatewayReq = req as GatewayRequest;
  const host = resolveHost(req);

  if (!host) {
    gatewayReq.tenantContext = null;
    return next();
  }

  const now = Date.now();
  const cached = tenantCache.get(host);
  if (cached && cached.expiresAt > now) {
    gatewayReq.tenantContext = cached.value;
    return next();
  }

  const tenant = await fetchTenantFromCoreApi(host, gatewayReq.requestId);
  tenantCache.set(host, { value: tenant, expiresAt: now + CACHE_TTL_MS });
  gatewayReq.tenantContext = tenant;
  next();
}
