import type { UserRole, AccountType, OnboardingStatus } from '../../types';

export type CheckEmailInput = { email: string };

export interface RegisterDto {
  email: string;
  password: string;
  accountType?: AccountType;
  name?: string;
  phone?: string;
}

export interface CheckEmailResult {
  valid: boolean;
  reason?: string;
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
  accountType: AccountType;
  onboardingStatus: OnboardingStatus;
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
