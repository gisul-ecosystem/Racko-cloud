import type { Request, Response, NextFunction } from 'express';
import { AppError, NotFoundError, ValidationError } from '../../utils/errors';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { ApiAccessAuthenticatedRequest } from './requireApiAccessToken.middleware';

function mapOperationalError(err: AppError): { status: number; error: string; error_description: string } {
  if (
    err instanceof NotFoundError ||
    err.statusCode === 404 ||
    err.code === 'NOT_FOUND' ||
    err.code === 'VM_NOT_FOUND' ||
    err.code === 'VM_OWNERSHIP_ERROR'
  ) {
    return { status: 404, error: 'not_found', error_description: err.message };
  }
  if (err instanceof ValidationError || err.statusCode === 400 || err.code === 'VALIDATION_ERROR') {
    return { status: 400, error: 'invalid_request', error_description: err.message };
  }
  if (err.statusCode === 401) {
    return { status: 401, error: 'invalid_token', error_description: err.message };
  }
  if (err.statusCode === 403) {
    return { status: 403, error: 'insufficient_scope', error_description: err.message };
  }
  return {
    status: err.statusCode,
    error: 'invalid_request',
    error_description: err.message,
  };
}

/**
 * OAuth-style errors for public API routes (after requireApiAccessToken).
 */
export function publicApiErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiReq = req as ApiAccessAuthenticatedRequest;
  if (!apiReq.apiAccess) {
    next(err);
    return;
  }

  logger.error('Public API error', {
    message: err.message,
    path: req.path,
    method: req.method,
    ...(config.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {}),
  });

  if (err instanceof AppError && err.isOperational) {
    const mapped = mapOperationalError(err);
    res.status(mapped.status).json({
      error: mapped.error,
      error_description: mapped.error_description,
    });
    return;
  }

  res.status(500).json({
    error: 'server_error',
    error_description:
      config.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
  });
}
