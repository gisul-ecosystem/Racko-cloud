import type { UserRole, AccountType, OnboardingStatus } from '../../types';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  accountType: AccountType;
  onboardingStatus: OnboardingStatus;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

export interface UpdateUserDto {
  isActive?: boolean;
}
