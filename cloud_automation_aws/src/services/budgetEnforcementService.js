import {
  DeleteAccountAssignmentCommand,
  CreateAccountAssignmentCommand,
} from '@aws-sdk/client-sso-admin';
import { ssoAdminClient, SSO_INSTANCE_ARN } from '../config/aws.js';
import Request from '../models/Request.js';
import BudgetEvent from '../models/BudgetEvent.js';
import UserSpend from '../models/UserSpend.js';

export async function suspendUser(request, user) {
  if (!user.permissionSetArn && !request.permissionSetArns?.[0]) return;

  const permissionSetArn = user.permissionSetArn || request.permissionSetArns[0];

  try {
    await ssoAdminClient.send(
      new DeleteAccountAssignmentCommand({
        InstanceArn: SSO_INSTANCE_ARN,
        TargetId: request.awsAccountId,
        TargetType: 'AWS_ACCOUNT',
        PermissionSetArn: permissionSetArn,
        PrincipalType: 'USER',
        PrincipalId: user.userId,
      })
    );

    await Request.findOneAndUpdate(
      { _id: request._id, 'identityUsers.userId': user.userId },
      {
        $set: {
          'identityUsers.$.budgetExceeded': true,
          'identityUsers.$.suspended': true,
        },
      }
    );

    await BudgetEvent.create({
      requestId: request._id,
      username: user.username,
      userId: user.userId,
      spendUsd: user.currentSpend || 0,
      budgetUsd: request.perUserBudgetUsd,
      action: 'suspended',
      reason: 'Budget exceeded',
    });

    console.log(`[budgetEnforcement] Suspended user ${user.username} — budget exceeded`);
  } catch (err) {
    console.error(`[budgetEnforcement] Failed to suspend ${user.username}:`, err.message);
  }
}

export async function reinstateUser(request, user) {
  const permissionSetArn = user.permissionSetArn || request.permissionSetArns?.[0];
  if (!permissionSetArn) return;

  try {
    await ssoAdminClient.send(
      new CreateAccountAssignmentCommand({
        InstanceArn: SSO_INSTANCE_ARN,
        TargetId: request.awsAccountId,
        TargetType: 'AWS_ACCOUNT',
        PermissionSetArn: permissionSetArn,
        PrincipalType: 'USER',
        PrincipalId: user.userId,
      })
    );

    await Request.findOneAndUpdate(
      { _id: request._id, 'identityUsers.userId': user.userId },
      {
        $set: {
          'identityUsers.$.budgetExceeded': false,
          'identityUsers.$.suspended': false,
        },
      }
    );

    await BudgetEvent.create({
      requestId: request._id,
      username: user.username,
      userId: user.userId,
      spendUsd: 0,
      budgetUsd: request.perUserBudgetUsd,
      action: 'reinstated',
      reason: 'Budget renewed by admin',
    });

    console.log(`[budgetEnforcement] Reinstated user ${user.username}`);
  } catch (err) {
    console.error(`[budgetEnforcement] Failed to reinstate ${user.username}:`, err.message);
  }
}

export async function checkAndEnforceBudgets() {
  const requests = await Request.find({
    status: 'Completed',
    perUserBudgetUsd: { $gt: 0 },
  });

  for (const request of requests) {
    for (const user of request.identityUsers || []) {
      if (!user.userId) continue;

      const today = new Date().toISOString().split('T')[0];
      const spendRecord = await UserSpend.findOne({
        requestId: request._id,
        username: user.username,
        date: today,
      });

      const currentSpend = spendRecord?.spendUsd || 0;
      user.currentSpend = currentSpend;

      if (currentSpend >= request.perUserBudgetUsd && !user.suspended) {
        console.log(
          `[budgetEnforcement] ${user.username} exceeded budget: $${currentSpend} >= $${request.perUserBudgetUsd}`
        );
        await suspendUser(request, user);
      }
    }
  }
}
