import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { UnauthorizedError, ServiceUnavailableError } from '../utils/errors';
import type { AuthenticatedRequest, TokenValidationResponse } from '../types';

/**
 * Option B: Remote token validation middleware.
 * Calls core-api POST /api/v1/auth/validate to check revocation.
 * Runs AFTER authMiddleware (Option A) — malformed tokens never reach here.
 *
 * Fail-closed: if core-api is unreachable, request is DENIED.
 * Never fail open on auth errors.
 */
export async function verifyMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authorization header missing.'));
  }

  const token = authHeader.slice(7);

  try {
    const response = await axios.post<TokenValidationResponse>(
      `${config.CORE_API_URL}/api/v1/auth/validate`,
      { accessToken: token },
      {
        timeout: 3000, // 3 second timeout
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': config.INTERNAL_SERVICE_SECRET,
          'X-Request-ID': (req as Request & { requestId?: string }).requestId ?? '',
        },
      }
    );

    const result = response.data;

    if (!result.valid) {
      logger.warn('Token validation failed', { reason: result.reason });
      return next(new UnauthorizedError('Token validation failed.'));
    }

    // Attach verified user data and forward headers to downstream
    const authReq = req as AuthenticatedRequest;
    authReq.user = {
      userId: result.userId!,
      role: result.role!,
      sessionId: result.sessionId!,
    };

    // Forward verified user context to downstream services
    req.headers['x-user-id'] = result.userId;
    req.headers['x-user-role'] = result.role;
    req.headers['x-session-id'] = result.sessionId;

    if (authReq.tenantContext) {
      req.headers['x-tenant-id'] = authReq.tenantContext.id;
    }

    next();
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || !error.response) {
        // core-api unreachable — FAIL CLOSED, never fail open
        logger.error('core-api unreachable during token validation — denying request', {
          error: error.message,
        });
        return next(new ServiceUnavailableError('Authentication service unavailable. Please try again.'));
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        return next(new UnauthorizedError('Token validation failed.'));
      }
    }

    logger.error('Unexpected error during token validation', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Always deny on uncertainty
    next(new UnauthorizedError('Authentication failed.'));
  }
}
