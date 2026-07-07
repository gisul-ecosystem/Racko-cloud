import { User } from '../../models/user.model';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import type { UserProfile } from './user.types';

export class UserService {
  /**
   * Get a user profile by ID.
   * Excludes all sensitive fields.
   */
  async getUserById(userId: string): Promise<UserProfile> {
    const user = await User.findById(userId).select(
      '-password -emailVerificationToken -emailVerificationExpires -failedLoginAttempts'
    );

    if (!user) {
      throw new NotFoundError('User not found.');
    }

    return {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  /**
   * List all users — super_admin only.
   */
  async listUsers(): Promise<UserProfile[]> {
    const users = await User.find()
      .select('-password -emailVerificationToken -emailVerificationExpires -failedLoginAttempts')
      .sort({ createdAt: -1 });

    return users.map((user) => ({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }));
  }

  /**
   * Activate or deactivate a user — super_admin only.
   */
  async setUserActive(targetUserId: string, isActive: boolean, requestingUserId: string): Promise<UserProfile> {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenError('You cannot deactivate your own account.');
    }

    const user = await User.findById(targetUserId).select(
      '-password -emailVerificationToken -emailVerificationExpires'
    );

    if (!user) {
      throw new NotFoundError('User not found.');
    }

    if (user.role === 'super_admin') {
      throw new ForbiddenError('Cannot modify super_admin account.');
    }

    user.isActive = isActive;
    await user.save();

    return {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}

export const userService = new UserService();
