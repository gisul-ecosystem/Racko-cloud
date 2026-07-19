import {
  CreateAccountAssignmentCommand,
  DescribeAccountAssignmentCreationStatusCommand,
  ListAccountAssignmentsCommand,
} from '@aws-sdk/client-sso-admin';
import { ssoAdminClient, SSO_INSTANCE_ARN, formatIdentityCenterError } from '../../config/aws.js';
import { pollUntil } from '../../utils/polling.js';

async function waitForAssignment(requestId) {
  if (!requestId) return;

  return pollUntil(
    async () => {
      const response = await ssoAdminClient.send(
        new DescribeAccountAssignmentCreationStatusCommand({
          InstanceArn: SSO_INSTANCE_ARN,
          AccountAssignmentCreationRequestId: requestId,
        })
      );

      return {
        status: response.AccountAssignmentCreationStatus?.Status,
        failureReason: response.AccountAssignmentCreationStatus?.FailureReason,
      };
    },
    {
      intervalMs: 5000,
      timeoutMs: 10 * 60 * 1000,
      isComplete: (result) => result.status === 'SUCCEEDED',
      isFailed: (result) => result.status === 'FAILED',
    }
  );
}

export async function assignUsersToAccount(request, awsAccountId, identityUsers, permissionSetArns) {
  if (!SSO_INSTANCE_ARN) {
    throw new Error('AWS_SSO_INSTANCE_ARN is not configured');
  }

  const hasPermissionSets =
    Boolean(permissionSetArns?.length) ||
    identityUsers.some((user) => Boolean(user.permissionSetArn));

  if (!hasPermissionSets) {
    throw new Error('No permission set ARN available for assignment');
  }

  const assignments = [];

  for (const user of identityUsers) {
    const resolvedPermissionSetArn = user.permissionSetArn || permissionSetArns?.[0];
    if (!resolvedPermissionSetArn) {
      throw new Error(`No permission set ARN available for user ${user.username || user.userId}`);
    }

    const targetAccountId = user.awsAccountId || awsAccountId;
    if (!targetAccountId) {
      throw new Error(`No AWS account ID available for user ${user.username || user.userId}`);
    }

    try {
      const { AccountAssignments } = await ssoAdminClient.send(
        new ListAccountAssignmentsCommand({
          InstanceArn: SSO_INSTANCE_ARN,
          AccountId: targetAccountId,
          PermissionSetArn: resolvedPermissionSetArn,
        })
      );
      const alreadyAssigned = (AccountAssignments ?? []).some(
        (a) => a.PrincipalId === user.userId && a.PrincipalType === 'USER'
      );
      if (alreadyAssigned) {
        console.log(
          `[PermissionSet] User ${user.userId} already assigned to account ${targetAccountId} — skipping`
        );
        assignments.push({
          userId: user.userId,
          username: user.username,
          permissionSetArn: resolvedPermissionSetArn,
          assignmentId: null,
          status: 'SUCCEEDED',
          targetAccountId,
        });
        continue;
      }
    } catch (e) {
      console.warn('[PermissionSet] Could not check existing assignments:', e.message);
    }

    const response = await ssoAdminClient.send(
      new CreateAccountAssignmentCommand({
        InstanceArn: SSO_INSTANCE_ARN,
        TargetId: targetAccountId,
        TargetType: 'AWS_ACCOUNT',
        PermissionSetArn: resolvedPermissionSetArn,
        PrincipalType: 'USER',
        PrincipalId: user.userId,
      })
    ).catch((err) => {
      throw formatIdentityCenterError(err, 'Assign user to account');
    });

    const creationStatus = response.AccountAssignmentCreationStatus;
    const statusId = creationStatus?.RequestId;
    const immediateStatus = creationStatus?.Status;

    if (immediateStatus === 'SUCCEEDED') {
      assignments.push({
        userId: user.userId,
        username: user.username,
        permissionSetArn: resolvedPermissionSetArn,
        assignmentId: statusId || null,
        status: 'SUCCEEDED',
        targetAccountId,
      });
      continue;
    }

    if (immediateStatus === 'FAILED') {
      throw new Error(
        creationStatus?.FailureReason || `Account assignment failed for ${user.username || user.userId}`
      );
    }

    if (statusId) {
      await waitForAssignment(statusId);
    }

    assignments.push({
      userId: user.userId,
      username: user.username,
      permissionSetArn: resolvedPermissionSetArn,
      assignmentId: statusId || null,
      status: 'SUCCEEDED',
      targetAccountId,
    });
  }

  return assignments;
}

export async function rollbackAssignments(assignments = []) {
  const { DeleteAccountAssignmentCommand } = await import('@aws-sdk/client-sso-admin');
  if (!SSO_INSTANCE_ARN) return;

  for (const assignment of assignments) {
    if (!assignment?.userId || !assignment?.permissionSetArn) continue;

    try {
      await ssoAdminClient.send(
        new DeleteAccountAssignmentCommand({
          InstanceArn: SSO_INSTANCE_ARN,
          TargetId: assignment.targetAccountId,
          TargetType: 'AWS_ACCOUNT',
          PermissionSetArn: assignment.permissionSetArn,
          PrincipalType: 'USER',
          PrincipalId: assignment.userId,
        })
      );
    } catch (err) {
      console.error(`Assignment rollback failed for ${assignment.userId}:`, err.message);
    }
  }
}
