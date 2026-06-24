import {
  AttachManagedPolicyToPermissionSetCommand,
  CreatePermissionSetCommand,
  PutInlinePolicyToPermissionSetCommand,
} from '@aws-sdk/client-sso-admin';
import { ssoAdminClient, SSO_INSTANCE_ARN, formatIdentityCenterError } from '../../config/aws.js';
import { deriveUsername } from '../../config/scpPolicies.js';
import {
  INLINE_IAM_POLICIES,
  INLINE_IAM_POLICY_ALIASES,
} from '../../config/iamPolicies.js';
import { withRetry } from '../../utils/retry.js';

function buildTagEnforcementStatement(username, requestId) {
  return [
    {
      Sid: 'EnforceUserTagOnCreate',
      Effect: 'Deny',
      Action: '*',
      Resource: '*',
      Condition: {
        StringNotEqualsIfExists: {
          'aws:RequestTag/racko:user': username,
        },
        'ForAnyValue:StringEquals': {
          'aws:CalledVia': [],
        },
        Null: {
          'aws:RequestTag/racko:user': 'false',
        },
      },
    },
    {
      Sid: 'AllowTagging',
      Effect: 'Allow',
      Action: [
        'ec2:CreateTags',
        'rds:AddTagsToResource',
        's3:PutObjectTagging',
        'eks:TagResource',
        'lambda:TagResource',
        'dynamodb:TagResource',
        'elasticache:AddTagsToResource',
        'redshift:CreateTags',
        'sqs:TagQueue',
        'sns:TagResource',
        'kinesis:AddTagsToStream',
        'sagemaker:AddTags',
        'es:AddTags',
        'lightsail:TagResource',
      ],
      Resource: '*',
    },
  ];
}

function resolveInlinePolicyName(policyName) {
  return INLINE_IAM_POLICY_ALIASES[policyName] || policyName;
}

/** Only the AWS-managed ReadOnlyAccess fallback is attached as a managed policy. */
const MANAGED_AWS_POLICIES = new Set(['ReadOnlyAccess']);

function partitionPolicies(policyNames) {
  const managedPolicies = [];
  const inlineStatements = [];

  for (const policyName of policyNames) {
    const inlineKey = resolveInlinePolicyName(policyName);
    const inlinePolicy = INLINE_IAM_POLICIES[inlineKey];
    if (inlinePolicy) {
      inlineStatements.push(...inlinePolicy.Statement);
      continue;
    }

    if (MANAGED_AWS_POLICIES.has(policyName) || policyName.startsWith('arn:')) {
      managedPolicies.push(policyName);
      continue;
    }

    throw new Error(
      `Unknown IAM policy "${policyName}". Expected a catalog inline policy such as EC2FullAccess.`
    );
  }

  const inlinePolicy =
    inlineStatements.length > 0
      ? { Version: '2012-10-17', Statement: inlineStatements }
      : null;

  return { managedPolicies, inlinePolicy };
}

function collectManagedPolicies(request) {
  const policies = new Set();

  for (const entry of request.permissions || []) {
    for (const policy of entry.policies || []) {
      if (policy) policies.add(policy);
    }
  }

  if (policies.size === 0) {
    policies.add('ReadOnlyAccess');
  }

  return [...policies];
}

export async function createPermissionSet(request, awsAccountId, options = {}) {
  if (!SSO_INSTANCE_ARN) {
    throw new Error('AWS_SSO_INSTANCE_ARN is not configured');
  }

  const { nameSuffix = '', username = null, userIndex = null } = options;
  const targetUsername = username || deriveUsername(request, userIndex ?? 0);
  const requestId = String(request._id);

  const requestedPolicies = collectManagedPolicies(request);
  const { managedPolicies, inlinePolicy } = partitionPolicies(requestedPolicies);

  const tagStatements = buildTagEnforcementStatement(targetUsername, requestId);
  const mergedInlinePolicy = {
    Version: '2012-10-17',
    Statement: [
      ...(inlinePolicy?.Statement || []),
      ...tagStatements,
      {
        Sid: 'AllowCostExplorerRead',
        Effect: 'Allow',
        Action: ['ce:GetCostAndUsage', 'ce:GetCostForecast'],
        Resource: '*',
      },
    ],
  };

  const permissionSetName = `RackoLab-${String(request._id).slice(-8)}${nameSuffix}`.slice(0, 32);
  const sessionDuration = 'PT8H';

  const created = await ssoAdminClient.send(
    new CreatePermissionSetCommand({
      InstanceArn: SSO_INSTANCE_ARN,
      Name: permissionSetName,
      Description: `Lab permission set for request ${request._id}`,
      SessionDuration: sessionDuration,
      Tags: [
        { Key: 'racko:user', Value: targetUsername },
        { Key: 'racko:request', Value: requestId },
        { Key: 'racko:managed', Value: 'true' },
      ],
    })
  ).catch((err) => {
    throw formatIdentityCenterError(err, 'Create permission set');
  });

  const permissionSetArn = created.PermissionSet?.PermissionSetArn;
  if (!permissionSetArn) {
    throw new Error('Failed to create permission set');
  }

  for (const policyArn of managedPolicies) {
    await withRetry(
      async () => {
        await ssoAdminClient.send(
          new AttachManagedPolicyToPermissionSetCommand({
            InstanceArn: SSO_INSTANCE_ARN,
            PermissionSetArn: permissionSetArn,
            ManagedPolicyArn: policyArn.startsWith('arn:')
              ? policyArn
              : `arn:aws:iam::aws:policy/${policyArn}`,
          })
        );
      },
      { maxAttempts: 3, delayMs: 1500 }
    );
  }

  await withRetry(
    async () => {
      await ssoAdminClient.send(
        new PutInlinePolicyToPermissionSetCommand({
          InstanceArn: SSO_INSTANCE_ARN,
          PermissionSetArn: permissionSetArn,
          InlinePolicy: JSON.stringify(mergedInlinePolicy),
        })
      );
    },
    { maxAttempts: 3, delayMs: 1500 }
  );

  // Permission set is provisioned to the account when CreateAccountAssignment runs.
  return {
    permissionSetArn,
    permissionSetName,
    managedPolicies: requestedPolicies,
  };
}

export async function createPermissionSets(request, awsAccountId, options = {}) {
  const result = await createPermissionSet(request, awsAccountId, options);
  return {
    permissionSetArns: [result.permissionSetArn],
    permissionSetName: result.permissionSetName,
    managedPolicies: result.managedPolicies,
  };
}

export async function rollbackPermissionSets(permissionSetArns = []) {
  const { DeletePermissionSetCommand } = await import('@aws-sdk/client-sso-admin');
  if (!SSO_INSTANCE_ARN) return;

  for (const permissionSetArn of permissionSetArns) {
    try {
      await ssoAdminClient.send(
        new DeletePermissionSetCommand({
          InstanceArn: SSO_INSTANCE_ARN,
          PermissionSetArn: permissionSetArn,
        })
      );
    } catch (err) {
      console.error(`Permission set rollback failed for ${permissionSetArn}:`, err.message);
    }
  }
}
