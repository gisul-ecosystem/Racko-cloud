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
  ListUserPoliciesCommand,
  UpdateLoginProfileCommand,
  PutUserPolicyCommand,
  TagUserCommand,
} from '@aws-sdk/client-iam';
import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import { iamClient, stsClient, MASTER_ACCOUNT_ID } from '../../config/aws.js';
import { getManagedPoliciesForRequest } from '../../config/iamPolicies.js';
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

const BASELINE_MANAGED_POLICIES = [
  'arn:aws:iam::aws:policy/IAMUserChangePassword',
  'arn:aws:iam::aws:policy/ReadOnlyAccess',
];

function getAllManagedPoliciesForUser(request) {
  return [...new Set([...BASELINE_MANAGED_POLICIES, ...getManagedPoliciesForRequest(request)])];
}

export async function getIamClientForAccount(accountId) {
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
  const allManagedPolicies = getAllManagedPoliciesForUser(request);

  for (const policyArn of allManagedPolicies) {
    await iamClient.send(
      new AttachUserPolicyCommand({
        UserName: username,
        PolicyArn: policyArn,
      })
    );
    console.log(`[IdentityProvisioner] Attached managed policy ${policyArn} to ${username}`);
  }

  const requestId = String(request._id);
  const smallInlinePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'EnforceRackoTagOnCreate',
        Effect: 'Deny',
        Action: [
          'ec2:RunInstances',
          'rds:CreateDBInstance',
          's3:CreateBucket',
          'lambda:CreateFunction',
          'dynamodb:CreateTable',
        ],
        Resource: '*',
        Condition: {
          Null: { 'aws:RequestTag/racko:request': 'true' },
        },
      },
      {
        Sid: 'AllowTagOnCreate',
        Effect: 'Allow',
        Action: [
          'ec2:RunInstances',
          'rds:CreateDBInstance',
          's3:CreateBucket',
          'lambda:CreateFunction',
          'dynamodb:CreateTable',
        ],
        Resource: '*',
        Condition: {
          StringEquals: { 'aws:RequestTag/racko:request': requestId },
        },
      },
      {
        Sid: 'RackoTagging',
        Effect: 'Allow',
        Action: [
          'ec2:CreateTags',
          'ec2:DeleteTags',
          'rds:AddTagsToResource',
          's3:PutBucketTagging',
          's3:PutObjectTagging',
          'lambda:TagResource',
          'dynamodb:TagResource',
          'tag:TagResources',
          'tag:GetResources',
        ],
        Resource: '*',
      },
    ],
  };

  await iamClient.send(
    new PutUserPolicyCommand({
      UserName: username,
      PolicyName: 'RackoLabPermissions',
      PolicyDocument: JSON.stringify(smallInlinePolicy),
    })
  );

  console.log(`[IdentityProvisioner] Attached inline RackoLabPermissions to ${username}`);
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
    await iamClient.send(
      new TagUserCommand({
        UserName: username,
        Tags: [
          { Key: 'racko:request', Value: requestId },
          { Key: 'racko:user-index', Value: String(userIndex + 1) },
          { Key: 'racko:managed', Value: 'true' },
          { Key: 'racko:access-type', Value: 'identity_center' },
        ],
      })
    );
    console.log(`[IdentityProvisioner] Re-applied tags to existing user ${username}`);
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
    policies: getAllManagedPoliciesForUser(request),
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

function resolveAccountIdForAddUser(request, userIndex) {
  const accounts = (request.provisionedResources?.accounts || [])
    .map((entry) => ({
      userIndex: entry.userIndex,
      accountId: entry.awsAccountId || entry.accountId,
    }))
    .filter((entry) => entry.accountId);

  if (request.costingMode === 'per_user') {
    const dedicated = accounts.find((entry) => Number(entry.userIndex) === Number(userIndex));
    if (dedicated?.accountId) return dedicated.accountId;
  }

  const existing = (request.identityUsers || []).find(
    (entry) => entry.accountId || entry.awsAccountId
  );

  return (
    request.awsAccountId ||
    request.provisionedResources?.targetAccountId ||
    existing?.accountId ||
    existing?.awsAccountId ||
    accounts[0]?.accountId ||
    MASTER_ACCOUNT_ID
  );
}

/** Provision one additional Direct IAM lab user on an existing request. */
export async function addIdentityUser(request, userIndex) {
  const accountId = resolveAccountIdForAddUser(request, userIndex);
  if (!accountId) {
    throw new Error('No AWS account available to add a lab user');
  }
  return createIamUser(accountId, Number(userIndex), String(request._id), request);
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

export async function reinstateIdentityUser(request, userIndex, {
  password: preferredPassword = null,
  forceNewPassword = false,
} = {}) {
  const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
  if (!user) throw new Error(`User index ${userIndex} not found`);

  const accountId = user.accountId || user.awsAccountId || request.awsAccountId;
  const iamClient = await getIamClientForAccount(accountId);
  // Prefer existing stored password so unblock does not invalidate emailed credentials.
  let newPassword;
  let passwordWasGenerated = false;
  if (forceNewPassword) {
    newPassword = generatePassword(16);
    passwordWasGenerated = true;
  } else if (preferredPassword && String(preferredPassword).trim()) {
    newPassword = String(preferredPassword).trim();
  } else if (user.password && String(user.password).trim()) {
    newPassword = String(user.password).trim();
  } else {
    newPassword = generatePassword(16);
    passwordWasGenerated = true;
  }

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
  return { password: newPassword, passwordWasGenerated };
}

export async function deprovisionIdentityUsers(request) {
  for (const user of request.identityUsers || []) {
    try {
      const accountId = user.accountId || user.awsAccountId || request.awsAccountId;
      if (!accountId || !user.username) continue;

      const client = await getIamClientForAccount(accountId);

      try {
        const { PolicyNames } = await client.send(
          new ListUserPoliciesCommand({ UserName: user.username })
        );
        for (const policyName of PolicyNames || []) {
          try {
            await client.send(
              new DeleteUserPolicyCommand({
                UserName: user.username,
                PolicyName: policyName,
              })
            );
          } catch (err) {
            if (err.name !== 'NoSuchEntityException') {
              console.warn(
                `[IdentityProvisioner] Inline policy ${policyName} delete warning: ${err.message}`
              );
            }
          }
        }
      } catch (err) {
        if (err.name !== 'NoSuchEntityException') {
          console.warn(`[IdentityProvisioner] List inline policies warning: ${err.message}`);
        }
      }

      try {
        const { AttachedPolicies } = await client.send(
          new ListAttachedUserPoliciesCommand({ UserName: user.username })
        );

        for (const policy of AttachedPolicies || []) {
          await client.send(
            new DetachUserPolicyCommand({
              UserName: user.username,
              PolicyArn: policy.PolicyArn,
            })
          );
        }
      } catch (err) {
        if (err.name !== 'NoSuchEntityException') {
          console.warn(`[IdentityProvisioner] Detach managed policies warning: ${err.message}`);
        }
      }

      try {
        await client.send(new DeleteLoginProfileCommand({ UserName: user.username }));
      } catch (err) {
        if (err.name !== 'NoSuchEntityException') throw err;
      }

      await client.send(new DeleteUserCommand({ UserName: user.username }));
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
