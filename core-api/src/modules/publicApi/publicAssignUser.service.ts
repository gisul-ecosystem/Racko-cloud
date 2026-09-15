import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { NotFoundError } from '../../utils/errors';

export interface PlatformAssignUserLookup {
  userId?: string;
  userEmail?: string;
  username?: string;
}

/**
 * Resolve a platform assignee by id, email, or username — only users created by this admin.
 */
export async function resolvePlatformAssignUserId(
  adminId: mongoose.Types.ObjectId,
  lookup: PlatformAssignUserLookup
): Promise<mongoose.Types.ObjectId> {
  const { userId, userEmail, username } = lookup;

  let user = null;

  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new NotFoundError('User not found.');
    }
    user = await User.findById(userId).select('_id createdBy').lean();
  } else if (userEmail) {
    const email = userEmail.toLowerCase().trim();
    user = await User.findOne({ email, createdBy: adminId }).select('_id createdBy').lean();
  } else if (username) {
    const normalized = username.toLowerCase().trim();
    user = await User.findOne({
      createdBy: adminId,
      username: normalized,
    })
      .select('_id createdBy')
      .lean();
  }

  if (!user || user.createdBy?.toString() !== adminId.toString()) {
    throw new NotFoundError('User not found.');
  }

  return new mongoose.Types.ObjectId(user._id.toString());
}
