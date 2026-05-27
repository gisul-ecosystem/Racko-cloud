import type { Request } from 'express';

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface VerifiedUser {
  userId: string;
  role: UserRole;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: VerifiedUser;
  requestId: string;
}

export interface TokenValidationResponse {
  valid: boolean;
  userId?: string;
  role?: UserRole;
  sessionId?: string;
  reason?: string;
}
