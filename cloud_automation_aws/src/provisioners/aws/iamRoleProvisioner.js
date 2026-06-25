import {
  CreateRoleCommand,
  PutRolePolicyCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
} from '@aws-sdk/client-iam';
import { iamClient, MASTER_ACCOUNT_ID } from '../../config/aws.js';
import { INLINE_IAM_POLICIES, INLINE_IAM_POLICY_ALIASES } from '../../config/iamPolicies.js';

function buildRoleName(request, userIndex) {
  const idSuffix = String(request._id).slice(-8);
  return `RackoLab-${idSuffix}-u${userIndex + 1}`.slice(0, 64);
}

function buildTrustPolicy() {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          AWS: `arn:aws:iam::${MASTER_ACCOUNT_ID}:root`,
        },
        Action: 'sts:AssumeRole',
        Condition: {},
      },
    ],
  };
}

function buildPermissionPolicy(request) {
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

export async function createLabRole(request, userIndex) {
  const roleName = buildRoleName(request, userIndex);
  const trustPolicy = buildTrustPolicy();
  const permissionPolicy = buildPermissionPolicy(request);

  try {
    const created = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
        Description: `Racko lab role for request ${request._id} user ${userIndex + 1}`,
        MaxSessionDuration: 28800,
        Tags: [
          { Key: 'racko:request', Value: String(request._id) },
          { Key: 'racko:user-index', Value: String(userIndex + 1) },
          { Key: 'racko:managed', Value: 'true' },
        ],
      })
    );

    const roleArn = created.Role?.Arn;
    if (!roleArn) throw new Error('Failed to create IAM role');

    await iamClient.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: 'RackoLabPermissions',
        PolicyDocument: JSON.stringify(permissionPolicy),
      })
    );

    return {
      roleName,
      roleArn,
      userIndex,
    };
  } catch (err) {
    if (err.name === 'EntityAlreadyExistsException') {
      const roleArn = `arn:aws:iam::${MASTER_ACCOUNT_ID}:role/${roleName}`;
      return { roleName, roleArn, userIndex };
    }
    throw err;
  }
}

export async function createLabRoles(request) {
  const accountCount = Number(request.accountCount) || 1;
  const roles = [];

  for (let i = 0; i < accountCount; i += 1) {
    const role = await createLabRole(request, i);
    roles.push(role);
  }

  return roles;
}

export async function rollbackLabRoles(roles = []) {
  for (const role of roles) {
    if (!role?.roleName) continue;
    try {
      await iamClient.send(
        new DeleteRolePolicyCommand({
          RoleName: role.roleName,
          PolicyName: 'RackoLabPermissions',
        })
      );
      await iamClient.send(
        new DeleteRoleCommand({ RoleName: role.roleName })
      );
      console.log(`[iamRoleProvisioner] Deleted role ${role.roleName}`);
    } catch (err) {
      console.error(`[iamRoleProvisioner] Rollback failed for ${role.roleName}:`, err.message);
    }
  }
}
