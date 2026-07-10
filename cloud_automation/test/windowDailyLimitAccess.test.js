const test = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { computeWindowAccessState } = require('../src/utils/windowAccessState');
const { resolveStaleSessionClose } = require('../src/utils/staleSessionClose');

const sampleWindow = {
  day_of_week: 3,
  window_start_time: '09:00:00',
  window_end_time: '17:00:00',
  timezone: 'Asia/Kolkata',
  daily_limit_hours: 1
};

const sampleConfig = {
  timezone: 'Asia/Kolkata',
  todayDate: '2026-07-09',
  todayWindow: sampleWindow,
  dailyLimitHours: 1
};

test('computeWindowAccessState keeps remainingMinutes at 0 after limit even if consumed drops post stale-close', () => {
  const afterStaleClose = computeWindowAccessState({
    config: sampleConfig,
    withinWindow: true,
    consumedMinutes: 50,
    limitMinutes: 60,
    limitReachedInDb: true
  });

  assert.equal(afterStaleClose.remainingMinutes, 0);
  assert.equal(afterStaleClose.limitReached, true);
  assert.equal(afterStaleClose.blockedForToday, true);
  assert.equal(afterStaleClose.blockedReason, 'limit_exceeded');
});

test('computeWindowAccessState keeps remainingMinutes at 0 outside window after daily limit hit', () => {
  const outsideWindowAfterLimit = computeWindowAccessState({
    config: sampleConfig,
    withinWindow: false,
    consumedMinutes: 55,
    limitMinutes: 60,
    limitReachedInDb: true
  });

  assert.equal(outsideWindowAfterLimit.remainingMinutes, 0);
  assert.equal(outsideWindowAfterLimit.limitReached, true);
  assert.equal(outsideWindowAfterLimit.blockedForToday, true);
  assert.equal(outsideWindowAfterLimit.blockedReason, 'limit_exceeded');
});

test('computeWindowAccessState shows factual remaining minutes when blocked outside window only', () => {
  const outsideWindow = computeWindowAccessState({
    config: sampleConfig,
    withinWindow: false,
    consumedMinutes: 50,
    limitMinutes: 60,
    limitReachedInDb: false
  });

  assert.equal(outsideWindow.remainingMinutes, 10);
  assert.equal(outsideWindow.limitReached, false);
  assert.equal(outsideWindow.blockedForToday, true);
  assert.equal(outsideWindow.blockedReason, 'outside_window');
  assert.equal(outsideWindow.blockedReasonLabel, 'Outside usage window');
});

test('computeWindowAccessState sets remainingMinutes to 0 at 60/60 before DB flag is written', () => {
  const atLimit = computeWindowAccessState({
    config: sampleConfig,
    withinWindow: true,
    consumedMinutes: 60,
    limitMinutes: 60,
    limitReachedInDb: false
  });

  assert.equal(atLimit.remainingMinutes, 0);
  assert.equal(atLimit.limitReached, true);
  assert.equal(atLimit.blockedForToday, true);
});

test('resolveStaleSessionClose uses enforcement timestamp instead of last_seen when limit was reached', () => {
  const loginAt = new Date('2026-07-09T03:30:00.000Z');
  const lastSeenAt = new Date('2026-07-09T04:20:00.000Z');
  const limitReachedAt = new Date('2026-07-09T04:30:00.000Z');
  const now = new Date('2026-07-09T05:00:00.000Z');

  const result = resolveStaleSessionClose({
    loginAt,
    lastSeenAt,
    now,
    limitReached: true,
    limitReachedAt
  });

  assert.equal(result.closeAt.toISOString(), limitReachedAt.toISOString());
  assert.equal(result.durationMins, 60);
  assert.equal(result.endedReason, 'daily_limit_reached');
});

test('resolveStaleSessionClose truncates to last_seen only when daily limit was not reached', () => {
  const loginAt = new Date('2026-07-09T03:30:00.000Z');
  const lastSeenAt = new Date('2026-07-09T04:20:00.000Z');
  const now = new Date('2026-07-09T05:00:00.000Z');

  const result = resolveStaleSessionClose({
    loginAt,
    lastSeenAt,
    now,
    limitReached: false,
    limitReachedAt: null
  });

  assert.equal(result.closeAt.toISOString(), lastSeenAt.toISOString());
  assert.equal(result.durationMins, 50);
  assert.equal(result.endedReason, 'stale_signin');
});

test('regression: 60/60 limit day stays at 0 remaining through stale-close then window-close sequence', () => {
  const limitMinutes = 60;

  const atLimit = computeWindowAccessState({
    config: sampleConfig,
    withinWindow: true,
    consumedMinutes: 60,
    limitMinutes,
    limitReachedInDb: false
  });
  assert.equal(atLimit.remainingMinutes, 0);

  const loginAt = new Date('2026-07-09T03:30:00.000Z');
  const lastSeenAt = new Date('2026-07-09T04:20:00.000Z');
  const limitReachedAt = new Date('2026-07-09T04:30:00.000Z');

  const staleClose = resolveStaleSessionClose({
    loginAt,
    lastSeenAt,
    now: new Date('2026-07-09T05:00:00.000Z'),
    limitReached: true,
    limitReachedAt
  });
  assert.equal(staleClose.durationMins, 60);

  const afterStaleClose = computeWindowAccessState({
    config: sampleConfig,
    withinWindow: true,
    consumedMinutes: staleClose.durationMins,
    limitMinutes,
    limitReachedInDb: true
  });
  assert.equal(afterStaleClose.remainingMinutes, 0);

  const afterWindowClose = computeWindowAccessState({
    config: sampleConfig,
    withinWindow: false,
    consumedMinutes: 50,
    limitMinutes,
    limitReachedInDb: true
  });
  assert.equal(afterWindowClose.remainingMinutes, 0);
  assert.equal(afterWindowClose.blockedForToday, true);
  assert.equal(afterWindowClose.blockedReason, 'limit_exceeded');
});

test('computeWindowAccessState uses configured timezone metadata from window config', () => {
  const tz = 'America/New_York';
  const config = {
    ...sampleConfig,
    timezone: tz,
    todayDate: DateTime.now().setZone(tz).toISODate()
  };

  const state = computeWindowAccessState({
    config,
    withinWindow: true,
    consumedMinutes: 10,
    limitMinutes: 60,
    limitReachedInDb: false
  });

  assert.equal(state.timezone, tz);
  assert.equal(state.remainingMinutes, 50);
});
