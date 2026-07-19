import type { UserRole } from '../../types';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

export interface UpdateUserDto {
  isActive?: boolean;
}
