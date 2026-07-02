import Request from '../models/Request.js';
import BudgetEvent from '../models/BudgetEvent.js';
import UserSpend from '../models/UserSpend.js';
import {
  suspendIdentityUser,
  reinstateIdentityUser,
} from '../provisioners/aws/identityProvisioner.js';
import { sendReinstateCredentialsEmail } from '../provisioners/aws/emailProvisioner.js';
import { createNotification } from './notificationService.js';

function resolveUsername(user, userIndex) {
  return user.username || `labuser${userIndex + 1}`;
}

export async function suspendUser(request, user, accessType) {
  try {
    if (accessType === 'identity_center') {
      await suspendIdentityUser(request, user.userIndex);
      await Request.findOneAndUpdate(
        { _id: request._id, 'identityUsers.userIndex': user.userIndex },
        {
          $set: {
            'identityUsers.$.suspended': true,
            'identityUsers.$.budgetExceeded': true,
          },
        }
      );
    } else {
      await Request.findOneAndUpdate(
        { _id: request._id, 'labRoles.userIndex': user.userIndex },
        {
          $set: {
            'labRoles.$.suspended': true,
            'labRoles.$.budgetExceeded': true,
          },
        }
      );
    }

    await BudgetEvent.create({
      requestId: request._id,
      username: resolveUsername(user, user.userIndex),
      userId: user.userId || String(user.userIndex),
      spendUsd: user.currentSpend || 0,
      budgetUsd: request.perUserBudgetUsd,
      action: 'suspended',
      reason: 'Budget exceeded',
    });

    console.log(`[budgetEnforcement] Suspended user ${user.userIndex + 1} (${accessType})`);

    await createNotification({
      type: 'user_suspended',
      title: 'User suspended — budget exceeded',
      message: `${resolveUsername(user, user.userIndex)} exceeded $${request.perUserBudgetUsd} budget ($${(user.currentSpend || 0).toFixed(2)} spent) in AWS Lab — access suspended`,
      requestId: request._id,
      metadata: {
        username: resolveUsername(user, user.userIndex),
        spendUsd: user.currentSpend || 0,
        budgetUsd: request.perUserBudgetUsd,
      },
    });
  } catch (err) {
    console.error('[budgetEnforcement] Suspend failed:', err.message);
  }
}

export async function reinstateUser(request, user, accessType) {
  try {
    if (accessType === 'identity_center') {
      const newPassword = await reinstateIdentityUser(request, user.userIndex);
      const updatedUser = {
        ...user,
        password: newPassword,
        consoleUrl:
          user.consoleUrl ||
          `https://${user.accountId || user.awsAccountId || request.awsAccountId}.signin.aws.amazon.com/console`,
      };
      await sendReinstateCredentialsEmail(request, updatedUser, newPassword);
    }

    const field = accessType === 'magic_link' ? 'labRoles' : 'identityUsers';
    await Request.findOneAndUpdate(
      { _id: request._id, [`${field}.userIndex`]: user.userIndex },
      {
        $set: {
          [`${field}.$.suspended`]: false,
          [`${field}.$.budgetExceeded`]: false,
          [`${field}.$.currentSpend`]: 0,
        },
      }
    );

    await BudgetEvent.create({
      requestId: request._id,
      username: resolveUsername(user, user.userIndex),
      userId: user.userId || String(user.userIndex),
      spendUsd: 0,
      budgetUsd: request.perUserBudgetUsd,
      action: 'reinstated',
      reason: 'Budget renewed by admin',
    });

    await createNotification({
      type: 'user_reinstated',
      title: 'User reinstated',
      message: `${resolveUsername(user, user.userIndex)} reinstated in AWS Lab #${String(request._id).slice(-6)}`,
      requestId: request._id,
    });
  } catch (err) {
    console.error('[budgetEnforcement] Reinstate failed:', err.message);
  }
}

export async function checkAndEnforceBudgets() {
  const requests = await Request.find({
    status: 'Completed',
    perUserBudgetUsd: { $gt: 0 },
  });

  for (const request of requests) {
    const accessType = request.accessType || 'magic_link';
    const users =
      accessType === 'magic_link' ? request.labRoles || [] : request.identityUsers || [];

    for (const user of users) {
      if (user.userIndex === undefined) continue;

      const today = new Date().toISOString().split('T')[0];
      const username = resolveUsername(user, user.userIndex);
      const spendRecord = await UserSpend.findOne({ requestId: request._id, username, date: today });
      const currentSpend = spendRecord?.spendUsd || 0;

      if (currentSpend >= request.perUserBudgetUsd && !user.suspended) {
        console.log(`[budgetEnforcement] ${username} exceeded $${request.perUserBudgetUsd}`);
        user.currentSpend = currentSpend;
        await suspendUser(request, user, accessType);
      }
    }
  }
}
