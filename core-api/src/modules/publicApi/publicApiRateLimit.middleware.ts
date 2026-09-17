import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { getRateLimitStore } from '../../utils/rateLimitStore';
import type { ApiAccessAuthenticatedRequest } from './requireApiAccessToken.middleware';

const WINDOW_MS = 60 * 1000;

function rateLimitKey(clientId: string): string {
  return `public:api:${clientId}`;
}

export async function publicApiRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiReq = req as ApiAccessAuthenticatedRequest;
  const ctx = apiReq.apiAccess;
  if (!ctx?.clientId) {
    next();
    return;
  }

  const limit =
    ctx.rateLimitPerMin && ctx.rateLimitPerMin > 0
      ? ctx.rateLimitPerMin
      : config.PUBLIC_API_RATE_LIMIT_PER_MIN;

  const result = await getRateLimitStore().consume(rateLimitKey(ctx.clientId), WINDOW_MS, limit);

  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSec));
    res.status(429).json({
      error: 'rate_limited',
      error_description: `Rate limit exceeded (${limit} requests per minute). Retry after ${result.retryAfterSec} seconds.`,
    });
    return;
  }

  next();
}
