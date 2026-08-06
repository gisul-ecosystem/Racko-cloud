import type { Request, Response, NextFunction } from 'express';
import { resolveAppBaseUrl, runWithRequestContext } from '../utils/requestContext';

/**
 * Binds per-request data (currently the caller's portal origin) to the async
 * context so deep call sites such as email templates can read it without
 * threading `req` through every service.
 */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  runWithRequestContext({ appBaseUrl: resolveAppBaseUrl(req) }, () => {
    next();
  });
}
