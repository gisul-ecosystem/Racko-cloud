import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVOCATION_POLICY_NAME,
  REVOCATION_PROPAGATION_BUFFER_MS,
  buildRevocationCutoffDate,
  buildRevocationPolicyDocument,
  formatRevocationTimestamp,
} from '../src/services/awsSessionRevocationService.js';

describe('AWS session revocation helpers', () => {
  it('builds the AWSRevokeOlderSessions deny policy', () => {
    const cutoff = new Date('2026-07-13T08:00:35.000Z');
    const policy = buildRevocationPolicyDocument(cutoff);

    assert.equal(policy.Version, '2012-10-17');
    assert.equal(policy.Statement[0].Effect, 'Deny');
    assert.equal(policy.Statement[0].Action, '*');
    assert.deepEqual(policy.Statement[0].Condition.DateLessThan, {
      'aws:TokenIssueTime': '2026-07-13T08:00:35Z',
    });
  });

  it('adds a propagation buffer to the cutoff timestamp', () => {
    const base = new Date('2026-07-13T08:00:00.000Z');
    const cutoff = buildRevocationCutoffDate(base);

    assert.equal(
      cutoff.getTime() - base.getTime(),
      REVOCATION_PROPAGATION_BUFFER_MS
    );
    assert.equal(formatRevocationTimestamp(cutoff), '2026-07-13T08:00:35Z');
  });

  it('uses the standard AWS revocation policy name', () => {
    assert.equal(REVOCATION_POLICY_NAME, 'AWSRevokeOlderSessions');
  });
});
