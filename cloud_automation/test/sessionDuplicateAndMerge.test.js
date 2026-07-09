const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeSessionIntervals,
  sumMergedSessionMinutes
} = require('../src/utils/sessionIntervalMerge');
const {
  isSignInNearOpenSession,
  getSignInSessionProximityMs
} = require('../src/utils/signInSessionProximity');
const { isUniqueOpenSessionViolation } = require('../src/utils/openSessionConstraint');

test('mergeSessionIntervals collapses 3 overlapping sessions into ~13 minutes not ~26', () => {
  const base = new Date('2026-07-09T08:50:00.000Z').getTime();
  const minute = 60 * 1000;

  const intervals = [
    { start: base, end: base + 13 * minute },
    { start: base + 18 * 1000, end: base + 13 * minute },
    { start: base + 22 * 1000, end: base + 13 * minute }
  ];

  const rawSum = intervals.reduce((total, { start, end }) => total + (end - start) / 60000, 0);
  const mergedMinutes = sumMergedSessionMinutes(intervals, 2 * 60 * 1000);

  assert.ok(rawSum > 25, `raw sum should double-count (${rawSum})`);
  assert.ok(Math.abs(mergedMinutes - 13) < 0.01, `expected ~13 minutes, got ${mergedMinutes}`);
});

test('mergeSessionIntervals merges adjacent sessions within gap tolerance', () => {
  const start = new Date('2026-07-09T09:00:00.000Z').getTime();
  const intervals = [
    { start, end: start + 10 * 60 * 1000 },
    { start: start + 11 * 60 * 1000, end: start + 20 * 60 * 1000 }
  ];

  const merged = mergeSessionIntervals(intervals, 2 * 60 * 1000);
  assert.equal(merged.length, 1);
  assert.equal(sumMergedSessionMinutes(merged), 20);
});

test('isSignInNearOpenSession matches Portal and ARM events within 2 minutes', () => {
  const sessionLoginAt = new Date('2026-07-09T14:22:21.000Z');
  const armSignInAt = new Date('2026-07-09T14:22:39.000Z');
  const portalTokenSignInAt = new Date('2026-07-09T14:22:43.000Z');

  assert.equal(
    isSignInNearOpenSession(armSignInAt, sessionLoginAt, getSignInSessionProximityMs()),
    true
  );
  assert.equal(
    isSignInNearOpenSession(portalTokenSignInAt, sessionLoginAt, getSignInSessionProximityMs()),
    true
  );
});

test('isSignInNearOpenSession rejects sign-ins well outside proximity window', () => {
  const sessionLoginAt = new Date('2026-07-09T14:22:21.000Z');
  const laterSignInAt = new Date('2026-07-09T14:30:00.000Z');

  assert.equal(
    isSignInNearOpenSession(laterSignInAt, sessionLoginAt, getSignInSessionProximityMs()),
    false
  );
});

test('isUniqueOpenSessionViolation detects partial unique index conflicts', () => {
  assert.equal(
    isUniqueOpenSessionViolation({
      code: '23505',
      constraint: 'idx_one_open_session_per_user'
    }),
    true
  );
  assert.equal(isUniqueOpenSessionViolation({ code: '23505', constraint: 'other_index' }), false);
  assert.equal(isUniqueOpenSessionViolation(new Error('other')), false);
});

test('race insert: unique open-session violation is recognized for heartbeat fallback', () => {
  const raceError = {
    code: '23505',
    message:
      'duplicate key value violates unique constraint "idx_one_open_session_per_user"'
  };

  assert.equal(isUniqueOpenSessionViolation(raceError), true);
});

test('proximity window sign-in should attach to existing session instead of opening new one', () => {
  const sessionLoginAt = new Date('2026-07-09T14:22:21.000Z');
  const graphEvents = [
    new Date('2026-07-09T14:22:39.000Z'),
    new Date('2026-07-09T14:22:43.000Z')
  ];

  for (const signInAt of graphEvents) {
    assert.equal(
      isSignInNearOpenSession(signInAt, sessionLoginAt, getSignInSessionProximityMs()),
      true,
      `expected heartbeat-only behavior for ${signInAt.toISOString()}`
    );
  }
});
