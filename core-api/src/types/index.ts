import type { Request } from 'express';

export type UserRole = 'super_admin' | 'admin';

export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  family: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
  requestId: string;
}

export interface ApiResponse<T = undefined> {
  success: boolean;
  message: string;
  code?: string;
  data?: T;
}

export interface RegisterDto {
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface VerifyEmailDto {
  token: string;
}

export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  role?: UserRole;
  sessionId?: string;
  reason?: string;
}
