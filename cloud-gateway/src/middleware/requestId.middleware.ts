import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attach a UUID request ID to every request for distributed tracing.
 * Forwards X-Request-ID to downstream services.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
