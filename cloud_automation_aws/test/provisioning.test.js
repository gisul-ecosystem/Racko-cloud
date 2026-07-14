import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScpDocument,
  deriveAccountEmail,
  deriveRequestAccountName,
  deriveUsername,
} from '../src/config/scpPolicies.js';
import { resolveLabAccount } from '../src/provisioners/aws/accountProvisioner.js';
import { isScpPolicyTypeError, isScpStepComplete } from '../src/provisioners/aws/scpProvisioner.js';
import { buildStepStatuses, getStatusMessage } from '../src/services/progressTracker.js';
import { isPerUserCosting, isSharedCosting } from '../src/utils/costingMode.js';
import {
  DEFAULT_IAM_POLICIES,
  INLINE_IAM_POLICIES,
  INLINE_IAM_POLICY_ALIASES,
  SERVICE_IAM_POLICIES,
  buildPermissionPolicy,
  buildRegionRestrictionStatements,
  REGION_EXEMPT_NOT_ACTIONS,
} from '../src/config/iamPolicies.js';

describe('scpPolicies', () => {
  it('builds deny SCP for unselected services', () => {
    const doc = buildScpDocument(['EC2', 'S3', 'Lambda']);
    assert.equal(doc.Version, '2012-10-17');
    assert.ok(doc.Statement[0].Action.includes('rds:*'));
    assert.ok(!doc.Statement[0].Action.includes('ec2:*'));
  });

  it('derives account name from request', () => {
    const name = deriveRequestAccountName({
      _id: 'abc123def456',
      customerEmail: 'student@school.edu',
    });
    assert.match(name, /^Racko-Lab-/);
  });

  it('derives usernames with request suffix', () => {
    const username = deriveUsername({ _id: 'abc123def456' }, 0);
    assert.equal(username, 'labuser1-def456');
  });

  it('derives unique user emails per request and user slot', () => {
    const request = { _id: 'abc123def456', customerEmail: 'student@school.edu' };
    assert.equal(deriveAccountEmail(request, 0), 'student+lab1-def456@school.edu');
    assert.equal(deriveAccountEmail(request, 1), 'student+lab2-def456@school.edu');
    assert.notEqual(
      deriveAccountEmail({ _id: 'abc123aaa111', customerEmail: 'student@school.edu' }, 0),
      deriveAccountEmail(request, 0)
    );
  });

  it('derives per-user account labels with user suffix', () => {
    const name = deriveRequestAccountName(
      { _id: 'abc123def456', customerEmail: 'student@school.edu' },
      2
    );
    assert.match(name, /-u3-/);
  });
});

describe('accountProvisioner', () => {
  it('resolves the configured master account id', () => {
    const previous = process.env.MASTER_ACCOUNT_ID;
    process.env.MASTER_ACCOUNT_ID = '123456789012';

    try {
      const result = resolveLabAccount({
        _id: 'abc123def456',
        customerEmail: 'student@school.edu',
      });

      assert.equal(result.awsAccountId, '123456789012');
      assert.match(result.accountName, /^Racko-Lab-/);
    } finally {
      process.env.MASTER_ACCOUNT_ID = previous;
    }
  });

  it('throws when master account id is missing', () => {
    const previous = process.env.MASTER_ACCOUNT_ID;
    delete process.env.MASTER_ACCOUNT_ID;

    try {
      assert.throws(
        () =>
          resolveLabAccount({
            _id: 'abc123def456',
            customerEmail: 'student@school.edu',
          }),
        /MASTER_ACCOUNT_ID is not configured/
      );
    } finally {
      process.env.MASTER_ACCOUNT_ID = previous;
    }
  });
});

describe('scpProvisioner', () => {
  it('detects SCP policy type errors', () => {
    assert.equal(
      isScpPolicyTypeError(new Error('This operation can be performed only for enabled policy types.')),
      true
    );
    assert.equal(isScpPolicyTypeError(new Error('Access denied')), false);
  });

  it('treats skipped SCP as a completed step', () => {
    assert.equal(isScpStepComplete({ scpSkipped: true, scps: [] }), true);
    assert.equal(isScpStepComplete({ scps: ['p-123'] }), true);
    assert.equal(isScpStepComplete({ scps: [] }), false);
  });
});

describe('iamPolicies', () => {
  it('defines inline full and read-only policies for every catalog service', () => {
    for (const service of Object.keys(SERVICE_IAM_POLICIES)) {
      const fullName = DEFAULT_IAM_POLICIES[service];
      const readName = `${service}ReadOnlyAccess`;

      assert.equal(SERVICE_IAM_POLICIES[service].includes(fullName), true);
      assert.equal(SERVICE_IAM_POLICIES[service].includes(readName), true);
      assert.equal(INLINE_IAM_POLICIES[fullName]?.Statement?.length > 0, true);
      assert.equal(INLINE_IAM_POLICIES[readName]?.Statement?.length > 0, true);
    }
  });

  it('maps legacy AWS managed policy names to inline catalog policies', () => {
    assert.equal(INLINE_IAM_POLICY_ALIASES.AmazonLightsailFullAccess, 'LightsailFullAccess');
    assert.equal(INLINE_IAM_POLICY_ALIASES.AmazonEC2FullAccess, 'EC2FullAccess');
    assert.equal(
      INLINE_IAM_POLICIES[INLINE_IAM_POLICY_ALIASES.AmazonEKSClusterPolicy],
      INLINE_IAM_POLICIES.EKSFullAccess
    );
  });

  it('denies regional resource creates outside the request region', () => {
    const doc = buildPermissionPolicy({
      _id: '6a546e0278b85a6c3b7c9433',
      region: 'eu-west-3',
      permissions: [{ serviceName: 'S3', policies: ['S3FullAccess'] }],
    });

    const regionDeny = doc.Statement.find((entry) => entry.Sid === 'DenyOutsideLabRegion');
    assert.ok(regionDeny);
    assert.equal(regionDeny.Effect, 'Deny');
    assert.deepEqual(regionDeny.NotAction, REGION_EXEMPT_NOT_ACTIONS);
    assert.equal(regionDeny.Condition.StringNotEquals['aws:RequestedRegion'], 'eu-west-3');

    const s3RegionDeny = doc.Statement.find((entry) => entry.Sid === 'DenyS3CreateOutsideLabRegion');
    assert.ok(s3RegionDeny);
    assert.equal(s3RegionDeny.Action, 's3:CreateBucket');
    assert.equal(s3RegionDeny.Condition.StringNotLike['s3:LocationConstraint'], 'eu-west-3');
  });

  it('builds broad regional restrictions for every catalog service permission', () => {
    for (const serviceName of Object.keys(SERVICE_IAM_POLICIES)) {
      const doc = buildPermissionPolicy({
        _id: 'abc123def456',
        region: 'ap-south-1',
        permissions: [{ serviceName, policies: [DEFAULT_IAM_POLICIES[serviceName]] }],
      });

      assert.equal(
        doc.Statement.some((entry) => entry.Sid === 'DenyOutsideLabRegion'),
        true,
        `${serviceName} should include broad regional deny`
      );
      assert.equal(
        doc.Statement.some((entry) => entry.Sid === 'DenyS3CreateOutsideLabRegion'),
        true,
        `${serviceName} should include S3 create regional deny`
      );
    }
  });

  it('allows deleting racko-tagged S3 buckets outside the lab region', () => {
    const doc = buildPermissionPolicy({
      _id: '6a54796b78b85a6c3b7c9b4c',
      region: 'eu-west-3',
      permissions: [{ serviceName: 'S3', policies: ['S3FullAccess'] }],
    });

    const cleanupDeny = doc.Statement.find(
      (entry) => entry.Sid === 'DenyS3TaggedCleanupOutsideLabRegion'
    );
    assert.ok(cleanupDeny);
    assert.ok(cleanupDeny.Action.includes('s3:DeleteBucket'));
    assert.equal(
      cleanupDeny.Condition.StringNotEqualsIfExists['aws:ResourceTag/racko:request'],
      '6a54796b78b85a6c3b7c9b4c'
    );
  });

  it('returns no regional restrictions when request region is missing', () => {
    assert.deepEqual(buildRegionRestrictionStatements(''), []);
    assert.deepEqual(buildRegionRestrictionStatements(null), []);
  });
});

describe('costingMode', () => {
  it('detects per-user costing mode', () => {
    assert.equal(isPerUserCosting('per_user'), true);
    assert.equal(isSharedCosting('shared'), true);
    assert.equal(isPerUserCosting('shared'), false);
  });
});

describe('progressTracker', () => {
  it('returns step statuses for in-progress provisioning', () => {
    const steps = buildStepStatuses({
      status: 'Provisioning',
      currentStep: 3,
    });

    assert.equal(steps[0].state, 'completed');
    assert.equal(steps[2].state, 'in_progress');
    assert.equal(steps[5].state, 'pending');
  });

  it('returns completed message', () => {
    const message = getStatusMessage({ status: 'Completed' });
    assert.match(message, /completed/i);
  });
});
