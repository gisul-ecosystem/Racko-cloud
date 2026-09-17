import type { Request, Response, NextFunction } from 'express';
import type { ApiAccessAuthenticatedRequest } from './requireApiAccessToken.middleware';
import { sendInsufficientScope } from './publicApi.errors';

/**
 * Require a single OAuth scope on api_access-authenticated public routes.
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiReq = req as ApiAccessAuthenticatedRequest;
    const scopes = apiReq.apiScopes;
    if (!scopes || !scopes.includes(scope)) {
      sendInsufficientScope(res, `The request requires the ${scope} scope.`);
      return;
    }
    next();
  };
}
