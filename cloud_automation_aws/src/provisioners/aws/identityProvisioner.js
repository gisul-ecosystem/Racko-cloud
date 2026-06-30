import {
  IAMClient,
  CreateUserCommand,
  CreateLoginProfileCommand,
  AttachUserPolicyCommand,
  GetUserCommand,
  DeleteUserCommand,
  DeleteLoginProfileCommand,
  DetachUserPolicyCommand,
  DeleteUserPolicyCommand,
  ListAttachedUserPoliciesCommand,
  UpdateLoginProfileCommand,
  PutUserPolicyCommand,
} from '@aws-sdk/client-iam';
import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import { iamClient, stsClient, MASTER_ACCOUNT_ID } from '../../config/aws.js';
import { INLINE_IAM_POLICIES, INLINE_IAM_POLICY_ALIASES } from '../../config/iamPolicies.js';
import { generatePassword } from '../../utils/passwordGenerator.js';
import Request from '../../models/Request.js';

const LAB_ADMIN_ROLE_NAME = process.env.RACKO_LAB_ADMIN_ROLE_NAME || 'RackoLabAdmin';

function deriveIamUsername(userIndex, requestId) {
  const last6 = String(requestId).slice(-6);
  return `rackolab${userIndex + 1}-${last6}`;
}

function buildConsoleUrl(accountId) {
  return `https://${accountId}.signin.aws.amazon.com/console`;
}

function buildInlineUserPolicy(request) {
  const statements = [];

  for (const entry of request.permissions || []) {
    for (const policyName of entry.policies || []) {
      const inlineKey = INLINE_IAM_POLICY_ALIASES[policyName] || policyName;
      const inlinePolicy = INLINE_IAM_POLICIES[inlineKey];
      if (inlinePolicy) {
        statements.push(...inlinePolicy.Statement);
      }
    }
  }

  if (statements.length === 0) {
    statements.push({
      Effect: 'Allow',
      Action: ['*:Describe*', '*:List*', '*:Get*'],
      Resource: '*',
    });
  }

  statements.push({
    Sid: 'AllowTagging',
    Effect: 'Allow',
    Action: ['ec2:CreateTags', 'rds:AddTagsToResource', 's3:PutObjectTagging'],
    Resource: '*',
  });

  return {
    Version: '2012-10-17',
    Statement: statements,
  };
}

function collectManagedPolicyArns(request) {
  const policies = new Set(['arn:aws:iam::aws:policy/IAMUserChangePassword']);

  for (const entry of request.permissions || []) {
    for (const policy of entry.policies || []) {
      if (!policy) continue;
      if (policy.startsWith('arn:')) {
        policies.add(policy);
      } else if (policy === 'ReadOnlyAccess') {
        policies.add('arn:aws:iam::aws:policy/ReadOnlyAccess');
      }
    }
  }

  if (policies.size === 1) {
    policies.add('arn:aws:iam::aws:policy/ReadOnlyAccess');
  }

  return [...policies];
}

async function getIamClientForAccount(accountId) {
  const normalizedAccountId = String(accountId).trim();

  if (normalizedAccountId === String(MASTER_ACCOUNT_ID || '').trim()) {
    return iamClient;
  }

  const roleArn = `arn:aws:iam::${normalizedAccountId}:role/${LAB_ADMIN_ROLE_NAME}`;
  const { Credentials } = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `RackoProvisioner-${Date.now()}`,
      DurationSeconds: 3600,
    })
  );

  if (!Credentials) {
    throw new Error(`Failed to assume ${roleArn}`);
  }

  return new IAMClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    },
  });
}

async function userExists(iamClient, username) {
  try {
    await iamClient.send(new GetUserCommand({ UserName: username }));
    return true;
  } catch (err) {
    if (err.name === 'NoSuchEntityException') return false;
    throw err;
  }
}

async function attachLabPolicies(iamClient, username, request) {
  const managedPolicies = collectManagedPolicyArns(request);

  for (const policyArn of managedPolicies) {
    await iamClient.send(
      new AttachUserPolicyCommand({
        UserName: username,
        PolicyArn: policyArn,
      })
    );
  }

  await iamClient.send(
    new PutUserPolicyCommand({
      UserName: username,
      PolicyName: 'RackoLabPermissions',
      PolicyDocument: JSON.stringify(buildInlineUserPolicy(request)),
    })
  );
}

async function createIamUser(accountId, userIndex, requestId, request) {
  const iamClient = await getIamClientForAccount(accountId);
  const username = deriveIamUsername(userIndex, requestId);
  const password = generatePassword(16);
  const consoleUrl = buildConsoleUrl(accountId);
  const exists = await userExists(iamClient, username);

  if (!exists) {
    await iamClient.send(
      new CreateUserCommand({
        UserName: username,
        Tags: [
          { Key: 'racko:request', Value: String(requestId) },
          { Key: 'racko:user-index', Value: String(userIndex + 1) },
          { Key: 'racko:managed', Value: 'true' },
          { Key: 'racko:access-type', Value: 'identity_center' },
        ],
      })
    );

    await iamClient.send(
      new CreateLoginProfileCommand({
        UserName: username,
        Password: password,
        PasswordResetRequired: false,
      })
    );

    await attachLabPolicies(iamClient, username, request);
    console.log(`[IdentityProvisioner] Created IAM user ${username} in account ${accountId}`);
  } else {
    await iamClient.send(
      new UpdateLoginProfileCommand({
        UserName: username,
        Password: password,
        PasswordResetRequired: false,
      })
    );
    console.log(`[IdentityProvisioner] IAM user ${username} already exists — password refreshed`);
  }

  return {
    userId: username,
    username,
    email: null,
    password,
    accountId,
    awsAccountId: accountId,
    consoleUrl,
    userIndex,
    suspended: false,
    budgetExceeded: false,
    currentSpend: 0,
    needsActivation: false,
    policies: collectManagedPolicyArns(request),
  };
}

function resolveAccountIdForUser(accounts, userIndex, costingMode) {
  if (!accounts?.length) {
    throw new Error('No lab accounts available for IAM user provisioning');
  }

  if (costingMode === 'per_user' && accounts[userIndex]) {
    return accounts[userIndex].accountId;
  }

  return accounts[0].accountId;
}

export async function provisionIdentityUsers(request, accounts = []) {
  const requestId = String(request._id);
  const accountCount = Number(request.accountCount) || 1;
  const users = [];

  for (let index = 0; index < accountCount; index += 1) {
    const accountId = resolveAccountIdForUser(accounts, index, request.costingMode);
    const user = await createIamUser(accountId, index, requestId, request);
    users.push(user);

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return users;
}

export async function createIdentityCenterUsers(request, accounts = []) {
  return provisionIdentityUsers(request, accounts);
}

export async function suspendIdentityUser(request, userIndex) {
  const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
  if (!user) throw new Error(`User index ${userIndex} not found`);

  const accountId = user.accountId || user.awsAccountId || request.awsAccountId;
  const iamClient = await getIamClientForAccount(accountId);

  try {
    await iamClient.send(new DeleteLoginProfileCommand({ UserName: user.username }));
  } catch (err) {
    if (err.name !== 'NoSuchEntityException') throw err;
  }

  await Request.findOneAndUpdate(
    { _id: request._id, 'identityUsers.userIndex': userIndex },
    { $set: { 'identityUsers.$.suspended': true } }
  );

  console.log(`[IdentityProvisioner] Suspended IAM user ${user.username}`);
}

export async function reinstateIdentityUser(request, userIndex) {
  const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
  if (!user) throw new Error(`User index ${userIndex} not found`);

  const accountId = user.accountId || user.awsAccountId || request.awsAccountId;
  const iamClient = await getIamClientForAccount(accountId);
  const newPassword = generatePassword(16);

  try {
    await iamClient.send(
      new CreateLoginProfileCommand({
        UserName: user.username,
        Password: newPassword,
        PasswordResetRequired: false,
      })
    );
  } catch (err) {
    if (err.name === 'EntityAlreadyExistsException') {
      await iamClient.send(
        new UpdateLoginProfileCommand({
          UserName: user.username,
          Password: newPassword,
          PasswordResetRequired: false,
        })
      );
    } else {
      throw err;
    }
  }

  await Request.findOneAndUpdate(
    { _id: request._id, 'identityUsers.userIndex': userIndex },
    {
      $set: {
        'identityUsers.$.suspended': false,
        'identityUsers.$.budgetExceeded': false,
        'identityUsers.$.currentSpend': 0,
        'identityUsers.$.password': newPassword,
      },
    }
  );

  console.log(`[IdentityProvisioner] Reinstated IAM user ${user.username}`);
  return newPassword;
}

export async function deprovisionIdentityUsers(request) {
  for (const user of request.identityUsers || []) {
    try {
      const accountId = user.accountId || user.awsAccountId || request.awsAccountId;
      if (!accountId || !user.username) continue;

      const iamClient = await getIamClientForAccount(accountId);

      try {
        await iamClient.send(
          new DeleteUserPolicyCommand({
            UserName: user.username,
            PolicyName: 'RackoLabPermissions',
          })
        );
      } catch (err) {
        if (err.name !== 'NoSuchEntityException') {
          console.warn(`[IdentityProvisioner] Inline policy delete warning: ${err.message}`);
        }
      }

      const { AttachedPolicies } = await iamClient.send(
        new ListAttachedUserPoliciesCommand({ UserName: user.username })
      );

      for (const policy of AttachedPolicies || []) {
        await iamClient.send(
          new DetachUserPolicyCommand({
            UserName: user.username,
            PolicyArn: policy.PolicyArn,
          })
        );
      }

      try {
        await iamClient.send(new DeleteLoginProfileCommand({ UserName: user.username }));
      } catch (err) {
        if (err.name !== 'NoSuchEntityException') throw err;
      }

      await iamClient.send(new DeleteUserCommand({ UserName: user.username }));
      console.log(`[IdentityProvisioner] Deleted IAM user ${user.username}`);
    } catch (err) {
      console.error(`[IdentityProvisioner] Failed to delete user ${user.username}:`, err.message);
    }
  }
}

export async function rollbackIdentityUsers(requestOrUsers) {
  if (Array.isArray(requestOrUsers)) {
    if (!requestOrUsers.length) return;
    await deprovisionIdentityUsers({ identityUsers: requestOrUsers, awsAccountId: null });
    return;
  }

  if (requestOrUsers?.identityUsers?.length) {
    await deprovisionIdentityUsers(requestOrUsers);
  }
}
