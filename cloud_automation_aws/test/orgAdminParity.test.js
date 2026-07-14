import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Request from '../src/models/Request.js';
import AccessRequest from '../src/models/AccessRequest.js';
import CleanupLog from '../src/models/CleanupLog.js';
import CustomIamPolicy from '../src/models/CustomIamPolicy.js';
import CustomIamPolicyAssignment from '../src/models/CustomIamPolicyAssignment.js';
import CustomService from '../src/models/CustomService.js';
import HistorySnapshot from '../src/models/HistorySnapshot.js';
import { computeSharedCostAttribution } from '../src/services/orgAdminService.js';
import { countCleanupDeleted } from '../src/utils/cleanupMetrics.js';

describe('AWS org-admin parity schemas', () => {
  it('persists request and per-user cleanup configuration', () => {
    const paths = Request.schema.paths;
    assert.ok(paths.resourceCleanupAction);
    assert.ok(paths.customServiceIds);

    const request = new Request({
      customerEmail: 'student@example.com',
      accountCount: 1,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000),
      region: 'ap-south-1',
      labRoles: [{
        userIndex: 0,
        cleanupDisabled: true,
        cleanupIntervalOverride: 6,
        budgetTopUpUsd: 5,
      }],
    });
    assert.equal(request.labRoles[0].cleanupDisabled, true);
    assert.equal(request.labRoles[0].cleanupIntervalOverride, 6);
    assert.equal(request.resourceCleanupAction, 'delete');
    request.resourceCleanupAction = 'pause';
    assert.equal(request.validateSync(), undefined);
  });

  it('defines durable parity collections', () => {
    for (const model of [
      AccessRequest,
      CleanupLog,
      CustomIamPolicy,
      CustomIamPolicyAssignment,
      CustomService,
      HistorySnapshot,
    ]) {
      assert.ok(model.modelName);
      assert.ok(model.schema.path('_id'));
    }
  });
});

describe('AWS cleanup action metrics', () => {
  it('counts paused resources as affected resources', () => {
    assert.equal(
      countCleanupDeleted({
        EC2: { stopped: 2 },
        RDS: { stopped: 1 },
        S3: { skipped: true, reason: 'pause_not_supported' },
      }),
      3
    );
  });
});

describe('shared AWS cost attribution', () => {
  it('attributes shared spend in proportion to session minutes', () => {
    const users = [
      { userIndex: 0, username: 'labuser1' },
      { userIndex: 1, username: 'labuser2' },
    ];
    const sessions = [
      { userId: 'labuser1', loginAt: '2026-07-01T00:00:00Z', logoutAt: '2026-07-01T01:00:00Z' },
      { userId: 'labuser2', loginAt: '2026-07-01T00:00:00Z', logoutAt: '2026-07-01T03:00:00Z' },
    ];
    const result = computeSharedCostAttribution(100, users, sessions);
    assert.equal(result[0].monthToDateCost, 25);
    assert.equal(result[1].monthToDateCost, 75);
    assert.equal(result[1].sharePercent, 75);
  });

  it('falls back to equal split when no sessions exist', () => {
    const result = computeSharedCostAttribution(
      10,
      [{ userIndex: 0 }, { userIndex: 1 }],
      []
    );
    assert.deepEqual(result.map((entry) => entry.monthToDateCost), [5, 5]);
    assert.ok(result.every((entry) => entry.attributionMethod === 'equal_split'));
  });
});
