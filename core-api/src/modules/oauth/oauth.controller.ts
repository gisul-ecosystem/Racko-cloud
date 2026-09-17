import type { Request, Response, NextFunction } from 'express';
import { OAuthError, sendOAuthError } from './oauth.errors';
import { OAuthThrottleError } from './oauthInvalidClientThrottle';
import { oauthService } from './oauth.service';
import { parseClientCredentials, readGrantType } from './parseClientCredentials';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export class OAuthController {
  async token(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const grantType = readGrantType(req);
      const credentials = parseClientCredentials(req);
      const body = await oauthService.issueClientCredentialsToken(
        grantType,
        credentials,
        clientIp(req)
      );
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof OAuthError) {
        sendOAuthError(res, err);
        return;
      }
      if (err instanceof OAuthThrottleError) {
        sendOAuthError(
          res,
          new OAuthError(err.statusCode, err.error, err.errorDescription)
        );
        return;
      }
      next(err);
    }
  }
}

export const oauthController = new OAuthController();
