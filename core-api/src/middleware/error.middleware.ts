import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * Global error handler. 
 * Never exposes stack traces in production.
 * Returns consistent error response shape.
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log all errors with context
  logger.error('Request error', {
    message: err.message,
    code: err instanceof AppError ? err.code : 'INTERNAL_ERROR',
    statusCode: err instanceof AppError ? err.statusCode : 500,
    path: req.path,
    method: req.method,
    requestId: (req as Request & { requestId?: string }).requestId,
    // Only log stack in development
    ...(config.NODE_ENV === 'development' && { stack: err.stack }),
  });

  if (err instanceof AppError && err.isOperational) {
    const payload: Record<string, unknown> = {
      success: false,
      message: err.message,
      code: err.code,
    };
    if ('errors' in err && Array.isArray((err as { errors?: unknown }).errors)) {
      payload.errors = (err as { errors: string[] }).errors;
    }
    if ('nextWindow' in err) {
      payload.error = err.message;
      payload.nextWindow = (err as { nextWindow: string | null }).nextWindow;
    }
    if ('resetToken' in err && typeof (err as { resetToken?: unknown }).resetToken === 'string') {
      payload.resetToken = (err as { resetToken: string }).resetToken;
    }
    res.status(err.statusCode).json(payload);
    return;
  }

  // Unknown/non-operational errors — never expose details in production
  res.status(500).json({
    success: false,
    message: config.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
    code: 'INTERNAL_ERROR',
  });
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found.`,
    code: 'NOT_FOUND',
  });
}
