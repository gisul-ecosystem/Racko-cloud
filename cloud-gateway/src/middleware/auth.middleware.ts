import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';
import type { AuthenticatedRequest } from '../types';
 
interface AccessTokenPayload {
  userId: string;
  role: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

/**
 * Option A: Local JWT validation middleware.
 * Verifies JWT signature and expiry locally using JWT_ACCESS_SECRET.
 * Malformed/expired tokens never reach core-api.
 * Attaches decoded payload to req.user.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authorization header missing or malformed.'));
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as AccessTokenPayload;

    (req as AuthenticatedRequest).user = {
      userId: payload.userId,
      role: payload.role as 'super_admin' | 'admin',
      sessionId: payload.sessionId,
    };

    // Forward request ID
    const requestId = (req as Request & { requestId?: string }).requestId ?? '';
    req.headers['x-request-id'] = requestId;

    next();
  } catch {
    // Always deny on any JWT error — never fail open
    next(new UnauthorizedError('Invalid or expired access token.'));
  }
}
