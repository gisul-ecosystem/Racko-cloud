import { PutRolePolicyCommand, PutUserPolicyCommand } from '@aws-sdk/client-iam';
import Request from '../models/Request.js';
import { iamClient, MASTER_ACCOUNT_ID } from '../config/aws.js';
import { getIamClientForAccount } from '../provisioners/aws/identityProvisioner.js';

export const REVOCATION_POLICY_NAME = 'AWSRevokeOlderSessions';
export const REVOCATION_PROPAGATION_BUFFER_MS = 35_000;

export function formatRevocationTimestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildRevocationCutoffDate(at = new Date()) {
  return new Date(at.getTime() + REVOCATION_PROPAGATION_BUFFER_MS);
}

export function buildRevocationPolicyDocument(cutoffDate) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Deny',
        Action: '*',
        Resource: '*',
        Condition: {
          DateLessThan: {
            'aws:TokenIssueTime': formatRevocationTimestamp(cutoffDate),
          },
        },
      },
    ],
  };
}

function parseAccountIdFromArn(arn) {
  return String(arn || '').split(':')[4] || null;
}

function parseRoleNameFromArn(roleArn) {
  const roleName = String(roleArn || '').split('/').pop();
  return roleName || null;
}

async function resolveIamClientForAccount(accountId) {
  const normalizedAccountId = String(accountId || '').trim();
  if (!normalizedAccountId || normalizedAccountId === String(MASTER_ACCOUNT_ID || '').trim()) {
    return iamClient;
  }
  return getIamClientForAccount(normalizedAccountId);
}

export async function revokeActiveRoleSessions(roleArn, { iamClient: clientOverride } = {}) {
  const roleName = parseRoleNameFromArn(roleArn);
  if (!roleName) {
    throw new Error('Invalid role ARN');
  }

  const accountId = parseAccountIdFromArn(roleArn);
  const client = clientOverride || (await resolveIamClientForAccount(accountId));
  const cutoff = buildRevocationCutoffDate();

  await client.send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: REVOCATION_POLICY_NAME,
      PolicyDocument: JSON.stringify(buildRevocationPolicyDocument(cutoff)),
    })
  );

  return {
    revoked: true,
    target: 'role',
    roleName,
    revokeBefore: formatRevocationTimestamp(cutoff),
  };
}

export async function revokeActiveIamUserSessions(username, accountId, { iamClient: clientOverride } = {}) {
  if (!username) {
    throw new Error('IAM username is required');
  }

  const client = clientOverride || (await resolveIamClientForAccount(accountId));
  const cutoff = buildRevocationCutoffDate();

  await client.send(
    new PutUserPolicyCommand({
      UserName: username,
      PolicyName: REVOCATION_POLICY_NAME,
      PolicyDocument: JSON.stringify(buildRevocationPolicyDocument(cutoff)),
    })
  );

  return {
    revoked: true,
    target: 'iam_user',
    username,
    revokeBefore: formatRevocationTimestamp(cutoff),
  };
}

export async function revokeLabUserConsoleSessions(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) {
    return { revoked: false, reason: 'request_not_found' };
  }

  const accessType = request.accessType || 'magic_link';

  if (accessType === 'identity_center') {
    const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
    if (!user?.username) {
      return { revoked: false, reason: 'user_not_found' };
    }

    const accountId = user.accountId || user.awsAccountId || request.awsAccountId;
    return revokeActiveIamUserSessions(user.username, accountId);
  }

  const role = request.labRoles?.find((entry) => entry.userIndex === userIndex);
  if (!role?.roleArn) {
    return { revoked: false, reason: 'role_not_found' };
  }

  return revokeActiveRoleSessions(role.roleArn);
}

export async function revokeLabUserConsoleSessionsSafe(requestId, userIndex) {
  try {
    const result = await revokeLabUserConsoleSessions(requestId, userIndex);
    if (result.revoked) {
      console.log(
        `[SessionRevocation] Revoked AWS console session for request ${requestId} user ${userIndex + 1} (${result.target})`
      );
    }
    return result;
  } catch (err) {
    console.error(
      `[SessionRevocation] Failed to revoke AWS console session for request ${requestId} user ${userIndex + 1}: ${err.message}`
    );
    return { revoked: false, reason: 'aws_error', error: err.message };
  }
}
