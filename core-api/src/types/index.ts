import type { Request } from 'express';

export type UserRole = 'super_admin' | 'staff' | 'admin' | 'user';
export type AccountType = 'legacy' | 'b2c' | 'b2b';
export type OnboardingStatus =
  | 'active'
  | 'kyc_pending'
  | 'org_details_pending'
  | 'org_review_pending'
  | 'org_approved'
  | 'org_rejected';

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
  accountType?: AccountType;
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
