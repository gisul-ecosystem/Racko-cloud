import {
  CreateRoleCommand,
  PutRolePolicyCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  DetachRolePolicyCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import { iamClient, MASTER_ACCOUNT_ID } from '../../config/aws.js';
import { buildPermissionPolicy } from '../../config/iamPolicies.js';
import { magicLinkSessionSeconds } from '../../utils/magicLinkSession.js';

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

export async function createLabRole(request, userIndex) {
  const roleName = buildRoleName(request, userIndex);
  const trustPolicy = buildTrustPolicy();
  const permissionPolicy = buildPermissionPolicy(request, roleName);

  try {
    const created = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
        Description: `Racko lab role for request ${request._id} user ${userIndex + 1}`,
        MaxSessionDuration: magicLinkSessionSeconds(),
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
      await iamClient.send(
        new PutRolePolicyCommand({
          RoleName: roleName,
          PolicyName: 'RackoLabPermissions',
          PolicyDocument: JSON.stringify(permissionPolicy),
        })
      );
      return { roleName, roleArn, userIndex };
    }
    throw err;
  }
}

export async function createLabRoles(request) {
  const accountCount = Number(request.accountCount) || 1;
  const roles = request.labRoles?.length ? request.labRoles : [];

  for (let i = 0; i < accountCount; i += 1) {
    const role = await createLabRole(request, i);
    const existingIndex = roles.findIndex((entry) => entry.userIndex === i);
    if (existingIndex >= 0) {
      roles[existingIndex] = role;
    } else {
      roles.push(role);
    }
  }

  return roles;
}

/** Detach managed policies, remove inline policies, then delete the IAM role. */
export async function deleteLabRoleFully(roleName, client = iamClient) {
  if (!roleName) return;

  try {
    const { AttachedPolicies } = await client.send(
      new ListAttachedRolePoliciesCommand({ RoleName: roleName })
    );
    for (const policy of AttachedPolicies || []) {
      try {
        await client.send(
          new DetachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn: policy.PolicyArn,
          })
        );
      } catch (err) {
        if (err.name !== 'NoSuchEntityException') {
          console.warn(
            `[iamRoleProvisioner] Detach ${policy.PolicyArn} from ${roleName}: ${err.message}`
          );
        }
      }
    }
  } catch (err) {
    if (err.name === 'NoSuchEntityException') return;
    console.warn(`[iamRoleProvisioner] List attached policies for ${roleName}: ${err.message}`);
  }

  try {
    const { PolicyNames } = await client.send(
      new ListRolePoliciesCommand({ RoleName: roleName })
    );
    for (const policyName of PolicyNames || []) {
      try {
        await client.send(
          new DeleteRolePolicyCommand({
            RoleName: roleName,
            PolicyName: policyName,
          })
        );
      } catch (err) {
        if (err.name !== 'NoSuchEntityException') {
          console.warn(
            `[iamRoleProvisioner] Delete inline ${policyName} on ${roleName}: ${err.message}`
          );
        }
      }
    }
  } catch (err) {
    if (err.name !== 'NoSuchEntityException') {
      console.warn(`[iamRoleProvisioner] List inline policies for ${roleName}: ${err.message}`);
    }
  }

  await client.send(new DeleteRoleCommand({ RoleName: roleName }));
  console.log(`[iamRoleProvisioner] Deleted role ${roleName}`);
}

export async function rollbackLabRoles(roles = []) {
  for (const role of roles) {
    if (!role?.roleName) continue;
    try {
      await deleteLabRoleFully(role.roleName);
    } catch (err) {
      console.error(`[iamRoleProvisioner] Rollback failed for ${role.roleName}:`, err.message);
    }
  }
}
