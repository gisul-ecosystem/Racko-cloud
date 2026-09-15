import type { Response } from 'express';

export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'unsupported_grant_type';

export class OAuthError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly error: OAuthErrorCode,
    public readonly errorDescription: string
  ) {
    super(errorDescription);
    this.name = 'OAuthError';
  }
}

export function sendOAuthError(res: Response, err: OAuthError): void {
  res.status(err.statusCode).json({
    error: err.error,
    error_description: err.errorDescription,
  });
}
