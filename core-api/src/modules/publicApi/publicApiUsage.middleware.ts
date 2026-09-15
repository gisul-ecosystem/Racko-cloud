import type { Request, Response, NextFunction } from 'express';
import type { ApiAccessAuthenticatedRequest } from './requireApiAccessToken.middleware';
import { apiCredentialUsageService } from './apiCredentialUsage.service';

function resolveRouteTemplate(req: Request): string {
  if (req.route?.path) {
    const base = req.baseUrl ?? '';
    return `${base}${req.route.path}`.replace(/\/+/g, '/');
  }
  return req.path;
}

export function publicApiUsageMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiReq = req as ApiAccessAuthenticatedRequest;

  res.on('finish', () => {
    if (!apiReq.apiAccess?.credentialId) {
      return;
    }
    apiCredentialUsageService.recordPublicApiCall({
      apiAccess: apiReq.apiAccess,
      method: req.method,
      route: resolveRouteTemplate(req),
      statusCode: res.statusCode,
    });
  });

  next();
}
