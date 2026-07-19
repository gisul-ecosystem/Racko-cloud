import type { UserRole } from '../../types';

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

export interface AuthTokens {
  accessToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  role?: UserRole;
  sessionId?: string;
  reason?: string;
}
