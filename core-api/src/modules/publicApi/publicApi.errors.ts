import type { Response } from 'express';

export function sendInvalidToken(res: Response, errorDescription: string): void {
  res.status(401).json({
    error: 'invalid_token',
    error_description: errorDescription,
  });
}

export function sendInsufficientScope(res: Response, errorDescription: string): void {
  res.status(403).json({
    error: 'insufficient_scope',
    error_description: errorDescription,
  });
}
